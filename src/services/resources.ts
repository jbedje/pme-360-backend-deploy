import { PrismaClient, ResourceType } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateResourceData {
  title: string;
  description: string;
  content?: string;
  url?: string;
  thumbnail?: string;
  thumbnailFile?: Express.Multer.File;
  creatorId?: string;
  type: ResourceType;
  author: string;
  tags?: string[];
  isPremium?: boolean;
}

export interface ResourceFilters {
  type?: string;
  author?: string;
  search?: string;
  tags?: string;
  isPremium?: boolean;
}

export interface ResourcePagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class ResourcesService {
  
  static async createResource(resourceData: CreateResourceData) {
    try {
      console.log(`📝 Creating resource: ${resourceData.title}`);

      // Upload thumbnail if provided as file
      let thumbnailUrl = resourceData.thumbnail;
      if (resourceData.thumbnailFile && resourceData.creatorId) {
        const { FileUploadService, FileType } = await import('./file-upload');
        const uploadResult = await FileUploadService.uploadFile(
          resourceData.thumbnailFile,
          FileType.RESOURCE_THUMBNAIL,
          resourceData.creatorId
        );
        thumbnailUrl = uploadResult.url;
      }

      const resource = await prisma.resource.create({
        data: {
          title: resourceData.title,
          description: resourceData.description,
          content: resourceData.content,
          url: resourceData.url,
          thumbnail: thumbnailUrl,
          type: resourceData.type,
          author: resourceData.author,
          isPremium: resourceData.isPremium || false,
          tags: resourceData.tags ? {
            create: resourceData.tags.map(tag => ({ tag }))
          } : undefined,
        },
        include: {
          tags: true,
        },
      });

      console.log(`✅ Resource created: ${resource.id}`);
      return resource;

    } catch (error) {
      console.error('❌ Create resource error:', error);
      throw error;
    }
  }

  static async getResources(filters: ResourceFilters, pagination: ResourcePagination) {
    try {
      console.log('📋 Getting resources with filters:', filters);

      const where: any = {};

      // Filtres
      if (filters.type) {
        where.type = filters.type as ResourceType;
      }

      if (filters.author) {
        where.author = { contains: filters.author };
      }

      if (filters.isPremium !== undefined) {
        where.isPremium = filters.isPremium;
      }

      if (filters.search) {
        where.OR = [
          { title: { contains: filters.search } },
          { description: { contains: filters.search } },
          { content: { contains: filters.search } },
          { author: { contains: filters.search } },
        ];
      }

      if (filters.tags) {
        where.tags = {
          some: {
            tag: { contains: filters.tags },
          },
        };
      }

      const total = await prisma.resource.count({ where });

      const resources = await prisma.resource.findMany({
        where,
        include: {
          tags: true,
        },
        orderBy: {
          [pagination.sortBy || 'createdAt']: pagination.sortOrder || 'desc',
        },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      return {
        resources,
        meta: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
          hasNext: pagination.page * pagination.limit < total,
          hasPrev: pagination.page > 1,
        },
      };

    } catch (error) {
      console.error('❌ Get resources error:', error);
      throw error;
    }
  }

  static async getResourceById(resourceId: string, incrementView: boolean = false) {
    try {
      console.log(`📄 Getting resource ${resourceId}`);

      const resource = await prisma.resource.findUnique({
        where: { id: resourceId },
        include: {
          tags: true,
        },
      });

      if (!resource) {
        throw new Error('Ressource non trouvée');
      }

      // Incrémenter le compteur de vues si demandé
      if (incrementView) {
        await prisma.resource.update({
          where: { id: resourceId },
          data: { viewCount: { increment: 1 } },
        });
        resource.viewCount += 1;
      }

      return resource;

    } catch (error) {
      console.error('❌ Get resource by ID error:', error);
      throw error;
    }
  }

  static async updateResource(resourceId: string, authorName: string, updateData: Partial<CreateResourceData>) {
    try {
      console.log(`📝 Updating resource ${resourceId}`);

      // Vérifier que l'utilisateur est l'auteur
      const existingResource = await prisma.resource.findUnique({
        where: { id: resourceId },
      });

      if (!existingResource) {
        throw new Error('Ressource non trouvée');
      }

      if (existingResource.author !== authorName) {
        throw new Error('Non autorisé à modifier cette ressource');
      }

      // Upload new thumbnail if provided as file
      let thumbnailUrl = updateData.thumbnail;
      if (updateData.thumbnailFile && updateData.creatorId) {
        const { FileUploadService, FileType } = await import('./file-upload');
        const uploadResult = await FileUploadService.uploadFile(
          updateData.thumbnailFile,
          FileType.RESOURCE_THUMBNAIL,
          updateData.creatorId
        );
        thumbnailUrl = uploadResult.url;

        // Delete old thumbnail if exists
        if (existingResource.thumbnail) {
          const publicId = existingResource.thumbnail.split('/').pop()?.split('.')[0];
          if (publicId) {
            await FileUploadService.deleteFile(publicId);
          }
        }
      }

      // Mettre à jour la ressource
      const resource = await prisma.resource.update({
        where: { id: resourceId },
        data: {
          title: updateData.title,
          description: updateData.description,
          content: updateData.content,
          url: updateData.url,
          thumbnail: thumbnailUrl,
          type: updateData.type,
          author: updateData.author,
          isPremium: updateData.isPremium,
        },
        include: {
          tags: true,
        },
      });

      // Gérer les tags si fournis
      if (updateData.tags) {
        // Supprimer les anciens tags
        await prisma.resourceTag.deleteMany({
          where: { resourceId },
        });

        // Ajouter les nouveaux tags
        await prisma.resourceTag.createMany({
          data: updateData.tags.map(tag => ({
            resourceId,
            tag,
          })),
        });

        // Recharger la ressource avec les nouveaux tags
        return await this.getResourceById(resourceId);
      }

      console.log(`✅ Resource updated: ${resource.id}`);
      return resource;

    } catch (error) {
      console.error('❌ Update resource error:', error);
      throw error;
    }
  }

  static async deleteResource(resourceId: string, authorName: string) {
    try {
      console.log(`🗑️ Deleting resource ${resourceId}`);

      const existingResource = await prisma.resource.findUnique({
        where: { id: resourceId },
      });

      if (!existingResource) {
        throw new Error('Ressource non trouvée');
      }

      if (existingResource.author !== authorName) {
        throw new Error('Non autorisé à supprimer cette ressource');
      }

      await prisma.resource.delete({
        where: { id: resourceId },
      });

      console.log(`✅ Resource deleted: ${resourceId}`);
      return { success: true };

    } catch (error) {
      console.error('❌ Delete resource error:', error);
      throw error;
    }
  }

  static async getResourcesByAuthor(authorName: string, pagination: ResourcePagination) {
    try {
      console.log(`📚 Getting resources by author: ${authorName}`);

      const total = await prisma.resource.count({
        where: { author: { contains: authorName } },
      });

      const resources = await prisma.resource.findMany({
        where: { author: { contains: authorName } },
        include: {
          tags: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      return {
        resources,
        meta: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
          hasNext: pagination.page * pagination.limit < total,
          hasPrev: pagination.page > 1,
        },
      };

    } catch (error) {
      console.error('❌ Get resources by author error:', error);
      throw error;
    }
  }

  static async getPopularResources(pagination: ResourcePagination) {
    try {
      console.log('🔥 Getting popular resources');

      const resources = await prisma.resource.findMany({
        include: {
          tags: true,
        },
        orderBy: { viewCount: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      const total = await prisma.resource.count();

      return {
        resources,
        meta: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
          hasNext: pagination.page * pagination.limit < total,
          hasPrev: pagination.page > 1,
        },
      };

    } catch (error) {
      console.error('❌ Get popular resources error:', error);
      throw error;
    }
  }
}