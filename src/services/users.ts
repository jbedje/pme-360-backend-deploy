import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger';

const prisma = new PrismaClient();

interface UpdateUserData {
  name?: string;
  company?: string;
  location?: string;
  description?: string;
  website?: string;
  linkedin?: string;
  phone?: string;
  avatar?: string;
  avatarFile?: Express.Multer.File;
}

interface UserFilters {
  profileType?: string;
  location?: string;
  verified?: boolean;
  search?: string;
}

interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class UsersService {
  
  static async getAllUsers(filters: UserFilters = {}, pagination: PaginationParams = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = pagination;

      const skip = (page - 1) * limit;

      // Construction des filtres Prisma
      const where: any = {};

      if (filters.profileType) {
        where.profileType = filters.profileType;
      }

      if (filters.location) {
        where.location = {
          contains: filters.location,
          mode: 'insensitive',
        };
      }

      if (filters.verified !== undefined) {
        where.verified = filters.verified;
      }

      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { company: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      // Récupérer les utilisateurs avec pagination
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          select: {
            id: true,
            name: true,
            email: true,
            profileType: true,
            status: true,
            company: true,
            location: true,
            avatar: true,
            description: true,
            website: true,
            linkedin: true,
            verified: true,
            completionScore: true,
            rating: true,
            reviewCount: true,
            createdAt: true,
            updatedAt: true,
            lastLogin: true,
          },
        }),
        prisma.user.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        users,
        meta: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      logger.error('❌ Get users error:', error);
      throw new Error('Erreur lors de la récupération des utilisateurs');
    }
  }

  static async getUserById(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          expertises: true,
          _count: {
            select: {
              connections: true,
              connectedTo: true,
              opportunities: true,
              applications: true,
            },
          },
        },
      });

      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        profileType: user.profileType,
        status: user.status,
        company: user.company,
        location: user.location,
        avatar: user.avatar,
        description: user.description,
        website: user.website,
        linkedin: user.linkedin,
        phone: user.phone,
        verified: user.verified,
        completionScore: user.completionScore,
        rating: user.rating,
        reviewCount: user.reviewCount,
        expertises: user.expertises.map(exp => ({
          id: exp.id,
          name: exp.name,
          level: exp.level,
          verified: exp.verified,
        })),
        stats: {
          connectionsCount: user._count.connections + user._count.connectedTo,
          opportunitiesCount: user._count.opportunities,
          applicationsCount: user._count.applications,
        },
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLogin: user.lastLogin,
      };
    } catch (error) {
      logger.error('❌ Get user by ID error:', error);
      throw error;
    }
  }

  static async updateUser(userId: string, updateData: UpdateUserData) {
    try {
      // Vérifier que l'utilisateur existe
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!existingUser) {
        throw new Error('Utilisateur non trouvé');
      }

      // Upload new avatar if provided as file
      let avatarUrl = updateData.avatar;
      if (updateData.avatarFile) {
        const { FileUploadService, FileType } = await import('./file-upload');
        const uploadResult = await FileUploadService.uploadFile(
          updateData.avatarFile,
          FileType.AVATAR,
          userId
        );
        avatarUrl = uploadResult.url;

        // Delete old avatar if exists
        if (existingUser.avatar) {
          const publicId = existingUser.avatar.split('/').pop()?.split('.')[0];
          if (publicId) {
            await FileUploadService.deleteFile(publicId);
          }
        }
      }

      // Prepare update data without the file
      const { avatarFile, ...updateDataWithoutFile } = updateData;
      const finalUpdateData = {
        ...updateDataWithoutFile,
        avatar: avatarUrl,
      };

      // Mettre à jour l'utilisateur
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: finalUpdateData,
        include: {
          expertises: true,
        },
      });

      // Calculer le nouveau score de complétion
      const completionScore = this.calculateCompletionScore(updatedUser);

      // Mettre à jour le score de complétion
      if (completionScore !== updatedUser.completionScore) {
        await prisma.user.update({
          where: { id: userId },
          data: { completionScore },
        });
      }

      logger.info(`✅ User updated successfully: ${updatedUser.email}`);

      return {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        profileType: updatedUser.profileType,
        status: updatedUser.status,
        company: updatedUser.company,
        location: updatedUser.location,
        avatar: updatedUser.avatar,
        description: updatedUser.description,
        website: updatedUser.website,
        linkedin: updatedUser.linkedin,
        phone: updatedUser.phone,
        verified: updatedUser.verified,
        completionScore,
        rating: updatedUser.rating,
        reviewCount: updatedUser.reviewCount,
        expertises: updatedUser.expertises.map(exp => ({
          id: exp.id,
          name: exp.name,
          level: exp.level,
          verified: exp.verified,
        })),
        updatedAt: updatedUser.updatedAt,
      };
    } catch (error) {
      logger.error('❌ Update user error:', error);
      throw error;
    }
  }

  static async deleteUser(userId: string) {
    try {
      // Vérifier que l'utilisateur existe
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!existingUser) {
        throw new Error('Utilisateur non trouvé');
      }

      // Supprimer l'utilisateur (cascade automatique)
      await prisma.user.delete({
        where: { id: userId },
      });

      logger.info(`✅ User deleted successfully: ${existingUser.email}`);
    } catch (error) {
      logger.error('❌ Delete user error:', error);
      throw error;
    }
  }

  static async addExpertise(userId: string, expertiseData: { name: string; level: number }) {
    try {
      // Vérifier que l'utilisateur existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      // Vérifier que l'expertise n'existe pas déjà
      const existingExpertise = await prisma.userExpertise.findFirst({
        where: {
          userId,
          name: expertiseData.name,
        },
      });

      if (existingExpertise) {
        throw new Error('Cette expertise existe déjà pour cet utilisateur');
      }

      // Créer la nouvelle expertise
      const expertise = await prisma.userExpertise.create({
        data: {
          userId,
          name: expertiseData.name,
          level: Math.min(Math.max(expertiseData.level, 1), 5), // Entre 1 et 5
        },
      });

      logger.info(`✅ Expertise added for user: ${userId}`);

      return {
        id: expertise.id,
        name: expertise.name,
        level: expertise.level,
        verified: expertise.verified,
      };
    } catch (error) {
      logger.error('❌ Add expertise error:', error);
      throw error;
    }
  }

  static async removeExpertise(userId: string, expertiseId: string) {
    try {
      // Vérifier que l'expertise appartient à l'utilisateur
      const expertise = await prisma.userExpertise.findFirst({
        where: {
          id: expertiseId,
          userId,
        },
      });

      if (!expertise) {
        throw new Error('Expertise non trouvée');
      }

      // Supprimer l'expertise
      await prisma.userExpertise.delete({
        where: { id: expertiseId },
      });

      logger.info(`✅ Expertise removed for user: ${userId}`);
    } catch (error) {
      logger.error('❌ Remove expertise error:', error);
      throw error;
    }
  }

  private static calculateCompletionScore(user: any): number {
    let score = 30; // Score de base

    // Informations de profil (+10 points chacun)
    if (user.company) score += 10;
    if (user.location) score += 10;
    if (user.description) score += 15;
    if (user.website) score += 5;
    if (user.linkedin) score += 5;
    if (user.phone) score += 5;

    // Avatar (+10 points)
    if (user.avatar) score += 10;

    // Expertises (+2 points par expertise, max 10)
    if (user.expertises) {
      score += Math.min(user.expertises.length * 2, 10);
    }

    return Math.min(score, 100);
  }
}