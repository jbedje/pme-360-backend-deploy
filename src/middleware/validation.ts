import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { logger } from '../config/logger';

export interface ValidationTargets {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  received?: any;
}

// Middleware de validation générique
export const validate = (schemas: ValidationTargets) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const errors: ValidationError[] = [];

    try {
      // Validation du body
      if (schemas.body) {
        try {
          req.body = await schemas.body.parseAsync(req.body);
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.push(...formatZodErrors(error, 'body'));
          }
        }
      }

      // Validation des query parameters
      if (schemas.query) {
        try {
          req.query = await schemas.query.parseAsync(req.query);
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.push(...formatZodErrors(error, 'query'));
          }
        }
      }

      // Validation des route parameters
      if (schemas.params) {
        try {
          req.params = await schemas.params.parseAsync(req.params);
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.push(...formatZodErrors(error, 'params'));
          }
        }
      }

      // Si des erreurs ont été trouvées, retourner une réponse d'erreur
      if (errors.length > 0) {
        logger.warn('Validation errors:', {
          url: req.originalUrl,
          method: req.method,
          errors,
          ip: req.ip,
        });

        return res.status(400).json({
          success: false,
          error: 'Données invalides',
          details: errors,
          timestamp: new Date().toISOString(),
        });
      }

      next();
    } catch (error) {
      logger.error('Validation middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur de validation interne',
        timestamp: new Date().toISOString(),
      });
    }
  };
};

// Formatter les erreurs Zod en format lisible
const formatZodErrors = (error: z.ZodError, source: string): ValidationError[] => {
  return error.errors.map(err => ({
    field: `${source}.${err.path.join('.')}`,
    message: err.message,
    code: err.code,
    received: err.received,
  }));
};

// Middleware de validation pour les fichiers uploadés
export const validateFileUpload = (
  allowedTypes: string[],
  maxSize: number,
  required: boolean = true
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Vérifier si un fichier est requis
      if (required && !req.file) {
        return res.status(400).json({
          success: false,
          error: 'Fichier requis',
          timestamp: new Date().toISOString(),
        });
      }

      // Si pas de fichier et pas requis, continuer
      if (!req.file && !required) {
        return next();
      }

      const file = req.file!;

      // Vérifier le type MIME
      if (!allowedTypes.includes(file.mimetype)) {
        logger.warn('Invalid file type uploaded:', {
          filename: file.originalname,
          mimetype: file.mimetype,
          allowedTypes,
          ip: req.ip,
        });

        return res.status(400).json({
          success: false,
          error: `Type de fichier non autorisé. Types acceptés: ${allowedTypes.join(', ')}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Vérifier la taille
      if (file.size > maxSize) {
        logger.warn('File too large uploaded:', {
          filename: file.originalname,
          size: file.size,
          maxSize,
          ip: req.ip,
        });

        return res.status(400).json({
          success: false,
          error: `Fichier trop volumineux. Taille maximum: ${Math.round(maxSize / 1024 / 1024)}MB`,
          timestamp: new Date().toISOString(),
        });
      }

      // Validation supplémentaire du nom de fichier
      if (!isValidFilename(file.originalname)) {
        return res.status(400).json({
          success: false,
          error: 'Nom de fichier invalide. Caractères autorisés: lettres, chiffres, tirets et points.',
          timestamp: new Date().toISOString(),
        });
      }

      next();
    } catch (error) {
      logger.error('File validation error:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur de validation du fichier',
        timestamp: new Date().toISOString(),
      });
    }
  };
};

// Valider le nom de fichier
const isValidFilename = (filename: string): boolean => {
  // Rejeter les noms de fichier dangereux
  const dangerousPatterns = [
    /\.\./g,           // Path traversal
    /[<>:"/\\|?*]/g,   // Caractères interdits Windows
    /^\.+$/,           // Noms de fichier cachés purs
    /^\s*$/,           // Noms vides ou espaces seulement
  ];

  return !dangerousPatterns.some(pattern => pattern.test(filename));
};

// Middleware de sanitisation des entrées
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Sanitiser récursivement tous les strings dans body, query, params
    req.body = sanitizeObject(req.body);
    req.query = sanitizeObject(req.query);
    req.params = sanitizeObject(req.params);

    next();
  } catch (error) {
    logger.error('Input sanitization error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur de sanitisation des données',
      timestamp: new Date().toISOString(),
    });
  }
};

// Sanitiser un objet récursivement
const sanitizeObject = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
};

// Sanitiser une chaîne de caractères
const sanitizeString = (str: string): string => {
  return str
    .trim()                                    // Supprimer les espaces en début/fin
    .replace(/\0/g, '')                        // Supprimer les caractères null
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Supprimer les scripts
    .replace(/javascript:/gi, '')              // Supprimer les protocoles javascript
    .replace(/on\w+\s*=/gi, '')               // Supprimer les handlers d'événements
    .substring(0, 5000);                       // Limiter la longueur
};

// Middleware de validation des permissions
export const validatePermissions = (requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Authentification requise',
          timestamp: new Date().toISOString(),
        });
      }

      // Vérifier les permissions
      const hasPermission = requiredPermissions.every(permission => {
        switch (permission) {
          case 'admin':
            return user.profileType === 'ADMIN';
          case 'verified':
            return user.verified;
          default:
            return true;
        }
      });

      if (!hasPermission) {
        logger.warn('Insufficient permissions:', {
          userId: user.id,
          requiredPermissions,
          userType: user.profileType,
          url: req.originalUrl,
          ip: req.ip,
        });

        return res.status(403).json({
          success: false,
          error: 'Permissions insuffisantes',
          timestamp: new Date().toISOString(),
        });
      }

      next();
    } catch (error) {
      logger.error('Permission validation error:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur de validation des permissions',
        timestamp: new Date().toISOString(),
      });
    }
  };
};