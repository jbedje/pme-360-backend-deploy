import { Request, Response, NextFunction } from 'express';
import { SimpleAuthService } from '../services/simple-auth';
import { AuthenticatedRequest } from '../middleware/simple-auth';
import { logger } from '../config/logger';

export class SimpleAuthController {
  
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, email, password, profileType, company, location } = req.body;

      // Validation basique
      if (!name || !email || !password || !profileType) {
        res.status(400).json({
          success: false,
          error: 'Nom, email, mot de passe et type de profil sont requis',
        });
        return;
      }

      // Validation de l'email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          success: false,
          error: 'Format d\'email invalide',
        });
        return;
      }

      // Validation du type de profil
      const validProfileTypes = ['PME', 'STARTUP', 'EXPERT', 'CONSULTANT', 'MENTOR', 'INCUBATOR', 'INVESTOR', 'FINANCIAL_INSTITUTION', 'PUBLIC_ORGANIZATION', 'TECH_PARTNER'];
      if (!validProfileTypes.includes(profileType)) {
        res.status(400).json({
          success: false,
          error: 'Type de profil invalide',
        });
        return;
      }

      const authResponse = await SimpleAuthService.register({
        name,
        email,
        password,
        profileType,
        company,
        location,
      });

      logger.info(`✅ User registered: ${email}`);

      res.status(201).json({
        success: true,
        message: 'Inscription réussie',
        data: authResponse,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message || 'Erreur lors de l\'inscription',
      });
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;

      // Validation basique
      if (!email || !password) {
        res.status(400).json({
          success: false,
          error: 'Email et mot de passe sont requis',
        });
        return;
      }

      const authResponse = await SimpleAuthService.login({ email, password });

      logger.info(`✅ User logged in: ${email}`);

      res.json({
        success: true,
        message: 'Connexion réussie',
        data: authResponse,
      });
    } catch (error: any) {
      res.status(401).json({
        success: false,
        error: error.message || 'Erreur lors de la connexion',
      });
    }
  }

  static async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Utilisateur non authentifié',
        });
        return;
      }

      const userProfile = await SimpleAuthService.getUserById(req.user.id);

      res.json({
        success: true,
        data: { user: userProfile },
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        error: error.message || 'Utilisateur non trouvé',
      });
    }
  }
}