import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import multer from 'multer';
import { Request } from 'express';
import path from 'path';
import { config } from '../config';

// Configuration Cloudinary
cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
});

// Types de fichiers autorisés
export enum FileType {
  AVATAR = 'avatar',
  RESOURCE_THUMBNAIL = 'resource_thumbnail',
  MESSAGE_ATTACHMENT = 'message_attachment',
  APPLICATION_DOCUMENT = 'application_document',
  EVENT_IMAGE = 'event_image',
  COMPANY_LOGO = 'company_logo',
}

// Configuration pour chaque type de fichier
const FILE_CONFIGS = {
  [FileType.AVATAR]: {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    folder: 'pme360/avatars',
    transformation: { width: 400, height: 400, crop: 'fill', quality: 'auto' },
  },
  [FileType.RESOURCE_THUMBNAIL]: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    folder: 'pme360/resources',
    transformation: { width: 800, height: 600, crop: 'fill', quality: 'auto' },
  },
  [FileType.MESSAGE_ATTACHMENT]: {
    maxSize: 25 * 1024 * 1024, // 25MB
    allowedFormats: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 'txt'],
    folder: 'pme360/messages',
    transformation: { quality: 'auto' },
  },
  [FileType.APPLICATION_DOCUMENT]: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedFormats: ['pdf', 'doc', 'docx'],
    folder: 'pme360/applications',
    transformation: {},
  },
  [FileType.EVENT_IMAGE]: {
    maxSize: 15 * 1024 * 1024, // 15MB
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    folder: 'pme360/events',
    transformation: { width: 1200, height: 800, crop: 'fill', quality: 'auto' },
  },
  [FileType.COMPANY_LOGO]: {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedFormats: ['jpg', 'jpeg', 'png', 'svg', 'webp'],
    folder: 'pme360/companies',
    transformation: { width: 300, height: 300, crop: 'fit', quality: 'auto' },
  },
};

interface UploadResult {
  url: string;
  publicId: string;
  format: string;
  size: number;
  width?: number;
  height?: number;
}

export class FileUploadService {
  
  // Créer le middleware Multer pour un type de fichier spécifique
  static createUploadMiddleware(fileType: FileType) {
    const fileConfig = FILE_CONFIGS[fileType];
    
    const storage = multer.memoryStorage();
    
    const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
      
      if (fileConfig.allowedFormats.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`Format de fichier non autorisé. Formats acceptés: ${fileConfig.allowedFormats.join(', ')}`));
      }
    };
    
    return multer({
      storage,
      fileFilter,
      limits: {
        fileSize: fileConfig.maxSize,
      },
    });
  }

  // Uploader un fichier vers Cloudinary
  static async uploadFile(
    file: Express.Multer.File, 
    fileType: FileType, 
    userId: string,
    additionalOptions: any = {}
  ): Promise<UploadResult> {
    try {
      const fileConfig = FILE_CONFIGS[fileType];
      
      console.log(`📤 Uploading ${fileType} for user ${userId}: ${file.originalname}`);

      // Options d'upload Cloudinary
      const uploadOptions = {
        folder: fileConfig.folder,
        public_id: `${userId}_${Date.now()}`,
        resource_type: 'auto' as const,
        transformation: fileConfig.transformation,
        ...additionalOptions,
      };

      // Upload vers Cloudinary
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              console.error('❌ Cloudinary upload error:', error);
              reject(error);
            } else if (result) {
              resolve(result);
            } else {
              reject(new Error('Upload failed - no result'));
            }
          }
        ).end(file.buffer);
      });

      console.log(`✅ File uploaded successfully: ${result.public_id}`);

      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        size: result.bytes,
        width: result.width,
        height: result.height,
      };

    } catch (error) {
      console.error(`❌ File upload failed for ${fileType}:`, error);
      throw new Error(`Échec de l'upload: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  // Supprimer un fichier de Cloudinary
  static async deleteFile(publicId: string): Promise<boolean> {
    try {
      console.log(`🗑️ Deleting file: ${publicId}`);
      
      const result = await cloudinary.uploader.destroy(publicId);
      
      if (result.result === 'ok') {
        console.log(`✅ File deleted successfully: ${publicId}`);
        return true;
      } else {
        console.warn(`⚠️ File deletion warning: ${result.result} for ${publicId}`);
        return false;
      }
      
    } catch (error) {
      console.error(`❌ File deletion failed: ${publicId}`, error);
      return false;
    }
  }

  // Générer une URL optimisée pour affichage
  static generateOptimizedUrl(publicId: string, options: any = {}): string {
    return cloudinary.url(publicId, {
      quality: 'auto',
      fetch_format: 'auto',
      ...options,
    });
  }

  // Générer plusieurs tailles d'une image
  static generateResponsiveUrls(publicId: string): { [key: string]: string } {
    const sizes = {
      thumbnail: { width: 150, height: 150, crop: 'fill' },
      small: { width: 300, height: 225, crop: 'fill' },
      medium: { width: 600, height: 450, crop: 'fill' },
      large: { width: 1200, height: 900, crop: 'fill' },
    };

    const urls: { [key: string]: string } = {};
    
    for (const [sizeName, transformation] of Object.entries(sizes)) {
      urls[sizeName] = this.generateOptimizedUrl(publicId, transformation);
    }

    return urls;
  }

  // Valider les quotas utilisateur (exemple simple)
  static async checkUserQuota(userId: string, fileSize: number): Promise<boolean> {
    try {
      // TODO: Implémenter la vérification des quotas en base de données
      // Pour l'instant, limite simple de 100MB par utilisateur
      const maxQuota = 100 * 1024 * 1024; // 100MB
      
      // Cette logique devrait être remplacée par une vraie vérification en DB
      console.log(`📊 Checking quota for user ${userId}: ${fileSize} bytes`);
      
      return fileSize <= maxQuota;
    } catch (error) {
      console.error('❌ Quota check failed:', error);
      return false;
    }
  }

  // Obtenir les informations d'un fichier Cloudinary
  static async getFileInfo(publicId: string) {
    try {
      const result = await cloudinary.api.resource(publicId);
      return {
        url: result.secure_url,
        format: result.format,
        size: result.bytes,
        width: result.width,
        height: result.height,
        createdAt: result.created_at,
      };
    } catch (error) {
      console.error(`❌ Failed to get file info for ${publicId}:`, error);
      throw error;
    }
  }

  // Valider le type de fichier par son contenu (sécurité)
  static validateFileType(file: Express.Multer.File): boolean {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png', 
      'image/webp',
      'image/svg+xml',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];

    return allowedMimeTypes.includes(file.mimetype);
  }

  // Nettoyer les fichiers orphelins (tâche de maintenance)
  static async cleanupOrphanedFiles(): Promise<number> {
    try {
      console.log('🧹 Starting cleanup of orphaned files...');
      
      // TODO: Implémenter la logique de nettoyage
      // 1. Récupérer tous les publicIds depuis Cloudinary
      // 2. Vérifier lesquels sont référencés en base de données
      // 3. Supprimer ceux qui ne le sont plus
      
      console.log('✅ Cleanup completed');
      return 0; // Nombre de fichiers supprimés
      
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      throw error;
    }
  }
}