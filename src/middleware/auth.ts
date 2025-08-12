import { Request, Response, NextFunction } from 'express';
import { JWTService } from '../utils/jwt';
import { AuthenticatedRequest } from '../types';
import { UnauthorizedError } from '../types';
import { logger } from '../config/logger';

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = JWTService.extractTokenFromHeader(authHeader);

    if (!token) {
      logger.debug('🚫 No token provided');
      throw new UnauthorizedError('Token d\'accès requis');
    }

    const payload = JWTService.verifyAccessToken(token);
    if (!payload) {
      logger.debug('🚫 Invalid or expired token');
      throw new UnauthorizedError('Token invalide ou expiré');
    }

    // Ajouter les informations utilisateur à la requête
    req.user = {
      id: payload.userId,
      email: payload.email,
      profileType: payload.profileType,
      verified: payload.verified,
    };

    logger.debug(`✅ User authenticated: ${payload.email}`);
    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return next(error);
    }
    
    logger.error('❌ Authentication middleware error:', error);
    next(new UnauthorizedError('Erreur d\'authentification'));
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = JWTService.extractTokenFromHeader(authHeader);

    if (token) {
      const payload = JWTService.verifyAccessToken(token);
      if (payload) {
        req.user = {
          id: payload.userId,
          email: payload.email,
          profileType: payload.profileType,
          verified: payload.verified,
        };
        logger.debug(`✅ Optional auth - User authenticated: ${payload.email}`);
      }
    }

    next();
  } catch (error) {
    // En cas d'erreur dans optionalAuth, on continue sans authentification
    logger.debug('Optional auth failed, continuing without authentication');
    next();
  }
};

export const requireVerified = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication requise'));
  }

  if (!req.user.verified) {
    logger.debug(`🚫 Unverified user attempted access: ${req.user.email}`);
    return next(new UnauthorizedError('Compte non vérifié'));
  }

  next();
};

export const requireProfileType = (allowedTypes: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication requise'));
    }

    if (!allowedTypes.includes(req.user.profileType)) {
      logger.debug(`🚫 Insufficient permissions for user: ${req.user.email}, type: ${req.user.profileType}`);
      return next(new UnauthorizedError('Type de profil non autorisé'));
    }

    next();
  };
};

export const requireOwnership = (resourceUserId: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication requise'));
    }

    if (req.user.id !== resourceUserId) {
      logger.debug(`🚫 User ${req.user.email} attempted to access resource owned by ${resourceUserId}`);
      return next(new UnauthorizedError('Accès non autorisé à cette ressource'));
    }

    next();
  };
};