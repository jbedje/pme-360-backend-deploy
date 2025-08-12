import dotenv from 'dotenv';
import { logger } from './logger';

// Charger les variables d'environnement
dotenv.config();

// Interface pour la configuration
interface Config {
  // Serveur
  NODE_ENV: string;
  PORT: number;
  API_PREFIX: string;

  // Base de données
  DATABASE_URL: string;

  // JWT
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;

  // CORS
  FRONTEND_URL: string;

  // Redis
  REDIS_URL: string;

  // Upload
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;

  // Email
  SENDGRID_API_KEY: string;
  FROM_EMAIL: string;

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;

  // Logging
  LOG_LEVEL: string;

  // Admin
  ADMIN_EMAIL: string;
}

// Fonction pour valider les variables d'environnement requises
const validateConfig = (): Config => {
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'FRONTEND_URL',
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    logger.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    process.exit(1);
  }

  return {
    // Serveur
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '3000', 10),
    API_PREFIX: process.env.API_PREFIX || '/api/v1',

    // Base de données
    DATABASE_URL: process.env.DATABASE_URL!,

    // JWT
    JWT_SECRET: process.env.JWT_SECRET!,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

    // CORS
    FRONTEND_URL: process.env.FRONTEND_URL!,

    // Redis
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

    // Upload
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',

    // Email
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || '',
    FROM_EMAIL: process.env.FROM_EMAIL || 'noreply@pme360.com',

    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',

    // Admin
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@pme360.com',
  };
};

// Configuration globale
export const config = validateConfig();

// Fonction pour afficher la configuration (sans les secrets)
export const logConfig = (): void => {
  const safeConfig = {
    ...config,
    JWT_SECRET: '[HIDDEN]',
    JWT_REFRESH_SECRET: '[HIDDEN]',
    DATABASE_URL: config.DATABASE_URL.replace(/\/\/.*:.*@/, '//[HIDDEN]@'),
    CLOUDINARY_API_SECRET: '[HIDDEN]',
    SENDGRID_API_KEY: '[HIDDEN]',
  };

  logger.info('🔧 Configuration loaded:');
  logger.info(JSON.stringify(safeConfig, null, 2));
};

export default config;