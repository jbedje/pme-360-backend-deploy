import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JWTPayload } from '../types';
import { logger } from '../config/logger';

export class JWTService {
  /**
   * Génère un token d'accès JWT
   */
  static generateAccessToken(payload: JWTPayload): string {
    try {
      const token = jwt.sign(payload as any, config.JWT_SECRET, {
        expiresIn: config.JWT_EXPIRES_IN,
        issuer: 'pme360-api',
        audience: 'pme360-frontend',
      });
      
      logger.debug(`✅ Access token generated for user: ${payload.userId}`);
      return token;
    } catch (error) {
      logger.error('❌ Error generating access token:', error);
      throw new Error('Failed to generate access token');
    }
  }

  /**
   * Génère un token de rafraîchissement
   */
  static generateRefreshToken(payload: JWTPayload): string {
    try {
      const token = jwt.sign(
        { userId: payload.userId, email: payload.email } as any,
        config.JWT_REFRESH_SECRET,
        {
          expiresIn: config.JWT_REFRESH_EXPIRES_IN,
          issuer: 'pme360-api',
          audience: 'pme360-frontend',
        }
      );
      
      logger.debug(`✅ Refresh token generated for user: ${payload.userId}`);
      return token;
    } catch (error) {
      logger.error('❌ Error generating refresh token:', error);
      throw new Error('Failed to generate refresh token');
    }
  }

  /**
   * Génère les deux tokens (access + refresh)
   */
  static generateTokenPair(payload: JWTPayload): {
    accessToken: string;
    refreshToken: string;
  } {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  }

  /**
   * Vérifie et decode un token d'accès
   */
  static verifyAccessToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET, {
        issuer: 'pme360-api',
        audience: 'pme360-frontend',
      }) as JWTPayload;
      
      logger.debug(`✅ Access token verified for user: ${decoded.userId}`);
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.debug('⏰ Access token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.debug('❌ Invalid access token');
      } else {
        logger.error('❌ Error verifying access token:', error);
      }
      return null;
    }
  }

  /**
   * Vérifie et decode un token de rafraîchissement
   */
  static verifyRefreshToken(token: string): { userId: string; email: string } | null {
    try {
      const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET, {
        issuer: 'pme360-api',
        audience: 'pme360-frontend',
      }) as { userId: string; email: string };
      
      logger.debug(`✅ Refresh token verified for user: ${decoded.userId}`);
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.debug('⏰ Refresh token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.debug('❌ Invalid refresh token');
      } else {
        logger.error('❌ Error verifying refresh token:', error);
      }
      return null;
    }
  }

  /**
   * Decode un token sans vérification (utile pour récupérer des infos même si expiré)
   */
  static decodeToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      return decoded;
    } catch (error) {
      logger.error('❌ Error decoding token:', error);
      return null;
    }
  }

  /**
   * Vérifie si un token est expiré
   */
  static isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) return true;
      
      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch (error) {
      return true;
    }
  }

  /**
   * Extrait le token du header Authorization
   */
  static extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    
    return parts[1];
  }

  /**
   * Génère une réponse d'authentification complète
   */
  static generateAuthResponse(payload: JWTPayload) {
    const tokens = this.generateTokenPair(payload);
    
    return {
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: config.JWT_EXPIRES_IN,
        tokenType: 'Bearer' as const,
      },
    };
  }
}