import { PrismaClient, User } from '@prisma/client';
import { SimpleJWTService } from '../utils/simple-jwt';
import { PasswordService } from '../utils/password';
import { logger } from '../config/logger';

const prisma = new PrismaClient();

interface RegisterData {
  name: string;
  email: string;
  password: string;
  profileType: string;
  company?: string;
  location?: string;
}

interface LoginCredentials {
  email: string;
  password: string;
}

export class SimpleAuthService {
  
  static async register(userData: RegisterData) {
    try {
      logger.info(`📝 Starting registration for: ${userData.email}`);

      // Vérifier si l'utilisateur existe déjà
      const existingUser = await prisma.user.findUnique({
        where: { email: userData.email.toLowerCase() },
      });

      if (existingUser) {
        logger.warn(`⚠️ Registration attempt with existing email: ${userData.email}`);
        throw new Error('Un compte avec cette adresse email existe déjà');
      }

      // Valider la force du mot de passe
      const passwordValidation = PasswordService.validatePasswordStrength(userData.password);
      if (!passwordValidation.isValid) {
        throw new Error(passwordValidation.errors.join(', '));
      }

      // Hasher le mot de passe
      const hashedPassword = await PasswordService.hash(userData.password);

      // Créer l'utilisateur
      const newUser = await prisma.user.create({
        data: {
          name: userData.name.trim(),
          email: userData.email.toLowerCase().trim(),
          password: hashedPassword,
          profileType: userData.profileType as any,
          company: userData.company?.trim(),
          location: userData.location?.trim(),
          verified: false,
          completionScore: 25,
        },
      });

      logger.info(`✅ User registered successfully: ${newUser.email}`);

      // Générer les tokens JWT
      const authResponse = SimpleJWTService.generateAuthResponse({
        userId: newUser.id,
        email: newUser.email,
        profileType: newUser.profileType,
        verified: newUser.verified,
      });

      return {
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          profileType: newUser.profileType,
          status: newUser.status,
          company: newUser.company,
          location: newUser.location,
          verified: newUser.verified,
          completionScore: newUser.completionScore,
          createdAt: newUser.createdAt,
          updatedAt: newUser.updatedAt,
        },
        tokens: authResponse.tokens,
      };
    } catch (error) {
      logger.error('❌ Registration error:', error);
      throw error;
    }
  }

  static async login(credentials: LoginCredentials) {
    try {
      logger.info(`🔐 Login attempt for: ${credentials.email}`);

      // Rechercher l'utilisateur
      const user = await prisma.user.findUnique({
        where: { email: credentials.email.toLowerCase() },
      });

      if (!user) {
        logger.warn(`⚠️ Login attempt with non-existent email: ${credentials.email}`);
        throw new Error('Identifiants invalides');
      }

      // Vérifier le mot de passe
      const isPasswordValid = await PasswordService.verify(credentials.password, user.password);
      if (!isPasswordValid) {
        logger.warn(`⚠️ Invalid password for user: ${credentials.email}`);
        throw new Error('Identifiants invalides');
      }

      // Mettre à jour la dernière connexion
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });

      logger.info(`✅ User logged in successfully: ${user.email}`);

      // Générer les tokens JWT
      const authResponse = SimpleJWTService.generateAuthResponse({
        userId: user.id,
        email: user.email,
        profileType: user.profileType,
        verified: user.verified,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          profileType: user.profileType,
          status: user.status,
          company: user.company,
          location: user.location,
          verified: user.verified,
          completionScore: user.completionScore,
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

  static async getUserById(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          expertises: true,
        },
      });

      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      return {
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
    } catch (error) {
      logger.error('❌ Get user error:', error);
      throw error;
    }
  }
}