import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth';
import { AuthenticatedRequest } from '../types';
import { logger } from '../config/logger';
import {
  ValidationError,
  UnauthorizedError,
  ConflictError,
  AppError,
} from '../types';

export class AuthController {
  
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, email, password, profileType, company, location } = req.body;

      // Validation basique
      if (!name || !email || !password || !profileType) {
        throw new ValidationError('Nom, email, mot de passe et type de profil sont requis');
      }

      // Validation de l'email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new ValidationError('Format d\'email invalide');
      }

      // Validation du type de profil
      const validProfileTypes = ['PME', 'STARTUP', 'EXPERT', 'CONSULTANT', 'MENTOR', 'INCUBATOR', 'INVESTOR', 'FINANCIAL_INSTITUTION', 'PUBLIC_ORGANIZATION', 'TECH_PARTNER'];
      if (!validProfileTypes.includes(profileType)) {
        throw new ValidationError('Type de profil invalide');
      }

      const authResponse = await AuthService.register({
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
    } catch (error) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;

      // Validation basique
      if (!email || !password) {
        throw new ValidationError('Email et mot de passe sont requis');
      }

      const authResponse = await AuthService.login({ email, password });

      logger.info(`✅ User logged in: ${email}`);

      res.json({
        success: true,
        message: 'Connexion réussie',
        data: authResponse,
      });
    } catch (error) {
      next(error);
    }
  }

  static async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new ValidationError('Refresh token requis');
      }

      const tokens = await AuthService.refreshTokens(refreshToken);

      res.json({
        success: true,
        message: 'Tokens rafraîchis avec succès',
        data: tokens,
      });
    } catch (error) {
      next(error);
    }
  }

  static async logout(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Utilisateur non authentifié');
      }

      await AuthService.logout(req.user.id);

      res.json({
        success: true,
        message: 'Déconnexion réussie',
      });
    } catch (error) {
      next(error);
    }
  }

  static async changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Utilisateur non authentifié');
      }

      const { currentPassword, newPassword, confirmPassword } = req.body;

      // Validation basique
      if (!currentPassword || !newPassword || !confirmPassword) {
        throw new ValidationError('Mot de passe actuel, nouveau mot de passe et confirmation requis');
      }

      if (newPassword !== confirmPassword) {
        throw new ValidationError('Les mots de passe ne correspondent pas');
      }

      if (currentPassword === newPassword) {
        throw new ValidationError('Le nouveau mot de passe doit être différent de l\'actuel');
      }

      await AuthService.changePassword(req.user.id, currentPassword, newPassword);

      res.json({
        success: true,
        message: 'Mot de passe modifié avec succès',
      });
    } catch (error) {
      next(error);
    }
  }

  static async requestPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        throw new ValidationError('Email requis');
      }

      // Validation de l'email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new ValidationError('Format d\'email invalide');
      }

      await AuthService.requestPasswordReset(email);

      // Réponse générique pour ne pas révéler si l'email existe
      res.json({
        success: true,
        message: 'Si cette adresse email existe, un lien de réinitialisation a été envoyé',
      });
    } catch (error) {
      next(error);
    }
  }

  static async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, resetToken, newPassword, confirmPassword } = req.body;

      // Validation basique
      if (!userId || !resetToken || !newPassword || !confirmPassword) {
        throw new ValidationError('Tous les champs sont requis');
      }

      if (newPassword !== confirmPassword) {
        throw new ValidationError('Les mots de passe ne correspondent pas');
      }

      await AuthService.resetPassword(userId, resetToken, newPassword);

      res.json({
        success: true,
        message: 'Mot de passe réinitialisé avec succès',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Utilisateur non authentifié');
      }

      // Récupérer les informations complètes de l'utilisateur
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          expertises: true,
        },
      });

      if (!user) {
        throw new UnauthorizedError('Utilisateur non trouvé');
      }

      const userProfile = {
        id: user.id,
        email: user.email,
        name: user.name,
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
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLogin: user.lastLogin,
      };

      res.json({
        success: true,
        data: { user: userProfile },
      });
    } catch (error) {
      next(error);
    }
  }

  static async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, verificationToken } = req.body;

      if (!userId || !verificationToken) {
        throw new ValidationError('ID utilisateur et token de vérification requis');
      }

      // TODO: Implémenter la vérification d'email
      // Pour l'instant, on simule la vérification
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      const user = await prisma.user.update({
        where: { id: userId },
        data: { verified: true },
      });

      res.json({
        success: true,
        message: 'Email vérifié avec succès',
        data: { verified: user.verified },
      });
    } catch (error) {
      next(error);
    }
  }

  static async resendVerificationEmail(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Utilisateur non authentifié');
      }

      if (req.user.verified) {
        res.json({
          success: true,
          message: 'Email déjà vérifié',
        });
        return;
      }

      // TODO: Implémenter l'envoi d'email de vérification
      logger.info(`📧 Verification email requested for user: ${req.user.email}`);

      res.json({
        success: true,
        message: 'Email de vérification envoyé',
      });
    } catch (error) {
      next(error);
    }
  }
}