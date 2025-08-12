import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../config/logger';

interface SimpleJWTPayload {
  userId: string;
  email: string;
  profileType: string;
  verified: boolean;
}

export class SimpleJWTService {
  
  static generateAccessToken(payload: SimpleJWTPayload): string {
    try {
      const token = jwt.sign(
        {
          userId: payload.userId,
          email: payload.email,
          profileType: payload.profileType,
          verified: payload.verified,
        },
        config.JWT_SECRET,
        {
          expiresIn: '24h',
          issuer: 'pme360-api',
          audience: 'pme360-frontend',
        }
      );
      
      logger.debug(`✅ Access token generated for user: ${payload.userId}`);
      return token;
    } catch (error) {
      logger.error('❌ Error generating access token:', error);
      throw new Error('Failed to generate access token');
    }
  }

  static generateRefreshToken(payload: SimpleJWTPayload): string {
    try {
      const token = jwt.sign(
        {
          userId: payload.userId,
          email: payload.email,
        },
        config.JWT_REFRESH_SECRET,
        {
          expiresIn: '7d',
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

  static verifyAccessToken(token: string): SimpleJWTPayload | null {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET, {
        issuer: 'pme360-api',
        audience: 'pme360-frontend',
      }) as any;
      
      logger.debug(`✅ Access token verified for user: ${decoded.userId}`);
      return {
        userId: decoded.userId,
        email: decoded.email,
        profileType: decoded.profileType,
        verified: decoded.verified,
      };
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

  static extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    
    return parts[1];
  }

  static generateAuthResponse(payload: SimpleJWTPayload) {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);
    
    return {
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: '24h',
        tokenType: 'Bearer' as const,
      },
    };
  }
}