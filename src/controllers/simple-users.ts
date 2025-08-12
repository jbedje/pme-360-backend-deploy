import { Request, Response } from 'express';
import { UsersService } from '../services/users';
import { AuthenticatedRequest } from '../middleware/simple-auth';
import { logger } from '../config/logger';

export class SimpleUsersController {
  
  static async getAllUsers(req: Request, res: Response) {
    try {
      const {
        page = '1',
        limit = '10',
        sortBy = 'createdAt',
        sortOrder = 'desc',
        profileType,
        location,
        verified,
        search,
      } = req.query;

      const filters = {
        profileType: profileType as string,
        location: location as string,
        verified: verified === 'true' ? true : verified === 'false' ? false : undefined,
        search: search as string,
      };

      const pagination = {
        page: parseInt(page as string),
        limit: Math.min(parseInt(limit as string), 50), // Max 50 par page
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
      };

      const result = await UsersService.getAllUsers(filters, pagination);

      res.json({
        success: true,
        data: result.users,
        meta: result.meta,
      });
    } catch (error: any) {
      logger.error('❌ Get all users error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Erreur lors de la récupération des utilisateurs',
      });
    }
  }

  static async getUserById(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'ID utilisateur requis',
        });
        return;
      }

      const user = await UsersService.getUserById(userId);

      res.json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      if (error.message === 'Utilisateur non trouvé') {
        res.status(404).json({
          success: false,
          error: error.message,
        });
      } else {
        logger.error('❌ Get user by ID error:', error);
        res.status(500).json({
          success: false,
          error: 'Erreur lors de la récupération de l\'utilisateur',
        });
      }
    }
  }

  static async updateCurrentUser(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Utilisateur non authentifié',
        });
        return;
      }

      const updateData = req.body;
      
      // Filtrer les champs autorisés à la mise à jour
      const allowedFields = ['name', 'company', 'location', 'description', 'website', 'linkedin', 'phone'];
      const filteredData: any = {};

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          filteredData[field] = updateData[field];
        }
      }

      if (Object.keys(filteredData).length === 0) {
        res.status(400).json({
          success: false,
          error: 'Aucune donnée valide à mettre à jour',
        });
        return;
      }

      const updatedUser = await UsersService.updateUser(req.user.id, filteredData);

      res.json({
        success: true,
        message: 'Profil mis à jour avec succès',
        data: updatedUser,
      });
    } catch (error: any) {
      if (error.message === 'Utilisateur non trouvé') {
        res.status(404).json({
          success: false,
          error: error.message,
        });
      } else {
        logger.error('❌ Update current user error:', error);
        res.status(500).json({
          success: false,
          error: 'Erreur lors de la mise à jour du profil',
        });
      }
    }
  }

  static async addExpertise(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Utilisateur non authentifié',
        });
        return;
      }

      const { name, level } = req.body;

      if (!name || !level) {
        res.status(400).json({
          success: false,
          error: 'Nom et niveau de l\'expertise requis',
        });
        return;
      }

      if (level < 1 || level > 5) {
        res.status(400).json({
          success: false,
          error: 'Le niveau doit être entre 1 et 5',
        });
        return;
      }

      const expertise = await UsersService.addExpertise(req.user.id, { name, level });

      res.status(201).json({
        success: true,
        message: 'Expertise ajoutée avec succès',
        data: expertise,
      });
    } catch (error: any) {
      if (error.message.includes('existe déjà')) {
        res.status(409).json({
          success: false,
          error: error.message,
        });
      } else {
        logger.error('❌ Add expertise error:', error);
        res.status(500).json({
          success: false,
          error: 'Erreur lors de l\'ajout de l\'expertise',
        });
      }
    }
  }
}