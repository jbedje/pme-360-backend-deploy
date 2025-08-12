import { PrismaClient, User } from '@prisma/client';
import { JWTService } from '../utils/jwt';
import { PasswordService } from '../utils/password';
import redisManager from '../config/redis';
import { logger } from '../config/logger';
import {
  UserCreateData,
  LoginCredentials,
  AuthResponse,
  RegisterData,
  JWTPayload,
  ConflictError,
  UnauthorizedError,
  ValidationError,
  NotFoundError,
} from '../types';

const prisma = new PrismaClient();

export class AuthService {
  
  static async register(userData: RegisterData): Promise<AuthResponse> {
    try {
      logger.info(`📝 Starting registration for: ${userData.email}`);

      // Vérifier si l'utilisateur existe déjà
      const existingUser = await prisma.user.findUnique({
        where: { email: userData.email.toLowerCase() },
      });

      if (existingUser) {
        logger.warn(`⚠️  Registration attempt with existing email: ${userData.email}`);
        throw new ConflictError('Un compte avec cette adresse email existe déjà');
      }

      // Valider la force du mot de passe
      const passwordValidation = PasswordService.validatePasswordStrength(userData.password);
      if (!passwordValidation.isValid) {
        throw new ValidationError(passwordValidation.errors.join(', '));
      }

      // Hasher le mot de passe
      const hashedPassword = await PasswordService.hash(userData.password);

      // Créer l'utilisateur
      const newUser = await prisma.user.create({
        data: {
          name: userData.name.trim(),
          email: userData.email.toLowerCase().trim(),
          password: hashedPassword,
          profileType: userData.profileType,
          company: userData.company?.trim(),
          location: userData.location?.trim(),
          verified: false,
          completionScore: 25, // Score initial basé sur les informations fournies
        },
      });

      logger.info(`✅ User registered successfully: ${newUser.email}`);

      // Générer les tokens JWT
      const jwtPayload: JWTPayload = {
        userId: newUser.id,
        email: newUser.email,
        profileType: newUser.profileType,
        verified: newUser.verified,
      };

      const authResponse = JWTService.generateAuthResponse(jwtPayload);

      // Stocker le refresh token dans Redis
      await this.storeRefreshToken(newUser.id, authResponse.tokens.refreshToken);

      // Créer la réponse complète
      return {
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          profileType: newUser.profileType,
          status: newUser.status,
          company: newUser.company,
          location: newUser.location,
          avatar: newUser.avatar,
          description: newUser.description,
          website: newUser.website,
          linkedin: newUser.linkedin,
          phone: newUser.phone,
          verified: newUser.verified,
          completionScore: newUser.completionScore,
          rating: newUser.rating,
          reviewCount: newUser.reviewCount,
          expertises: [], // Sera peuplé par une relation
          createdAt: newUser.createdAt,
          updatedAt: newUser.updatedAt,
          lastLogin: newUser.lastLogin,
        },
        tokens: authResponse.tokens,
      };
    } catch (error) {
      logger.error('❌ Registration error:', error);
      throw error;
    }
  }

  static async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      logger.info(`🔐 Login attempt for: ${credentials.email}`);

      // Rechercher l'utilisateur
      const user = await prisma.user.findUnique({
        where: { email: credentials.email.toLowerCase() },
        include: {
          expertises: true,
        },
      });

      if (!user) {
        logger.warn(`⚠️  Login attempt with non-existent email: ${credentials.email}`);
        throw new UnauthorizedError('Identifiants invalides');
      }

      // Vérifier le mot de passe
      const isPasswordValid = await PasswordService.verify(credentials.password, user.password);
      if (!isPasswordValid) {
        logger.warn(`⚠️  Invalid password for user: ${credentials.email}`);
        throw new UnauthorizedError('Identifiants invalides');
      }

      // Mettre à jour la dernière connexion
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });

      logger.info(`✅ User logged in successfully: ${user.email}`);

      // Générer les tokens JWT
      const jwtPayload: JWTPayload = {
        userId: user.id,
        email: user.email,
        profileType: user.profileType,
        verified: user.verified,
      };

      const authResponse = JWTService.generateAuthResponse(jwtPayload);

      // Stocker le refresh token dans Redis
      await this.storeRefreshToken(user.id, authResponse.tokens.refreshToken);

      return {
        user: {
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
        },
        tokens: authResponse.tokens,
      };
    } catch (error) {
      logger.error('❌ Login error:', error);
      throw error;
    }
  }

  static async refreshTokens(refreshToken: string): Promise<{ tokens: any }> {
    try {
      logger.debug('🔄 Token refresh attempt');

      // Vérifier le refresh token
      const decoded = JWTService.verifyRefreshToken(refreshToken);
      if (!decoded) {
        throw new UnauthorizedError('Refresh token invalide');
      }

      // Vérifier que le token existe dans Redis
      const storedToken = await redisManager.get(`refresh_token:${decoded.userId}`);
      if (!storedToken || storedToken !== refreshToken) {
        logger.warn(`⚠️  Invalid refresh token for user: ${decoded.userId}`);
        throw new UnauthorizedError('Refresh token invalide ou expiré');
      }

      // Récupérer l'utilisateur
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user) {
        throw new NotFoundError('Utilisateur non trouvé');
      }

      // Générer de nouveaux tokens
      const jwtPayload: JWTPayload = {
        userId: user.id,
        email: user.email,
        profileType: user.profileType,
        verified: user.verified,
      };

      const authResponse = JWTService.generateAuthResponse(jwtPayload);

      // Stocker le nouveau refresh token dans Redis
      await this.storeRefreshToken(user.id, authResponse.tokens.refreshToken);

      logger.info(`✅ Tokens refreshed for user: ${user.email}`);

      return {
        tokens: authResponse.tokens,
      };
    } catch (error) {
      logger.error('❌ Token refresh error:', error);
      throw error;
    }
  }

  static async logout(userId: string): Promise<void> {
    try {
      logger.info(`🚪 Logout for user: ${userId}`);

      // Supprimer le refresh token de Redis
      await redisManager.del(`refresh_token:${userId}`);

      logger.info(`✅ User logged out successfully: ${userId}`);
    } catch (error) {
      logger.error('❌ Logout error:', error);
      throw error;
    }
  }

  static async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      logger.info(`🔐 Password change attempt for user: ${userId}`);

      // Récupérer l'utilisateur
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundError('Utilisateur non trouvé');
      }

      // Vérifier le mot de passe actuel
      const isCurrentPasswordValid = await PasswordService.verify(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw new UnauthorizedError('Mot de passe actuel incorrect');
      }

      // Valider le nouveau mot de passe
      const passwordValidation = PasswordService.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new ValidationError(passwordValidation.errors.join(', '));
      }

      // Hasher le nouveau mot de passe
      const hashedNewPassword = await PasswordService.hash(newPassword);

      // Mettre à jour le mot de passe
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedNewPassword },
      });

      // Invalider tous les refresh tokens existants
      await redisManager.del(`refresh_token:${userId}`);

      logger.info(`✅ Password changed successfully for user: ${userId}`);
    } catch (error) {
      logger.error('❌ Change password error:', error);
      throw error;
    }
  }

  static async requestPasswordReset(email: string): Promise<void> {
    try {
      logger.info(`🔐 Password reset request for: ${email}`);

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!user) {
        // Ne pas révéler que l'utilisateur n'existe pas
        logger.warn(`⚠️  Password reset request for non-existent user: ${email}`);
        return;
      }

      // Générer un token de réinitialisation
      const resetToken = PasswordService.generateTempPassword(32);
      const resetTokenExpiry = new Date(Date.now() + 1000 * 60 * 60); // 1 heure

      // Stocker le token dans Redis
      await redisManager.setex(
        `password_reset:${user.id}`,
        3600, // 1 heure
        resetToken
      );

      // TODO: Envoyer l'email de réinitialisation
      logger.info(`📧 Password reset token generated for user: ${user.email}`);
      logger.debug(`Reset token: ${resetToken}`); // À supprimer en production

    } catch (error) {
      logger.error('❌ Password reset request error:', error);
      throw error;
    }
  }

  static async resetPassword(userId: string, resetToken: string, newPassword: string): Promise<void> {
    try {
      logger.info(`🔐 Password reset attempt for user: ${userId}`);

      // Vérifier le token de réinitialisation
      const storedToken = await redisManager.get(`password_reset:${userId}`);
      if (!storedToken || storedToken !== resetToken) {
        throw new UnauthorizedError('Token de réinitialisation invalide ou expiré');
      }

      // Valider le nouveau mot de passe
      const passwordValidation = PasswordService.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new ValidationError(passwordValidation.errors.join(', '));
      }

      // Hasher le nouveau mot de passe
      const hashedPassword = await PasswordService.hash(newPassword);

      // Mettre à jour le mot de passe
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      // Supprimer le token de réinitialisation
      await redisManager.del(`password_reset:${userId}`);

      // Invalider tous les refresh tokens existants
      await redisManager.del(`refresh_token:${userId}`);

      logger.info(`✅ Password reset successfully for user: ${userId}`);
    } catch (error) {
      logger.error('❌ Password reset error:', error);
      throw error;
    }
  }

  private static async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    try {
      // Stocker le refresh token avec expiration (30 jours)
      await redisManager.setex(
        `refresh_token:${userId}`,
        30 * 24 * 60 * 60, // 30 jours en secondes
        refreshToken
      );
    } catch (error) {
      logger.error('❌ Error storing refresh token:', error);
      throw error;
    }
  }
}