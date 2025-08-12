import { Request, Response, NextFunction } from 'express';
import { SimpleJWTService } from '../utils/simple-jwt';
import { logger } from '../config/logger';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    profileType: string;
    verified: boolean;
  };
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = SimpleJWTService.extractTokenFromHeader(authHeader);

    if (!token) {
      logger.debug('🚫 No token provided');
      res.status(401).json({
        success: false,
        error: 'Token d\'accès requis',
      });
      return;
    }

    const payload = SimpleJWTService.verifyAccessToken(token);
    if (!payload) {
      logger.debug('🚫 Invalid or expired token');
      res.status(401).json({
        success: false,
        error: 'Token invalide ou expiré',
      });
      return;
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
    logger.error('❌ Authentication middleware error:', error);
    res.status(401).json({
      success: false,
      error: 'Erreur d\'authentification',
    });
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = SimpleJWTService.extractTokenFromHeader(authHeader);

    if (token) {
      const payload = SimpleJWTService.verifyAccessToken(token);
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
    logger.debug('Optional auth failed, continuing without authentication');
    next();
  }
};