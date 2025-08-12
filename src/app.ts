import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { logger, morganStream } from './config/logger';
import { connectDatabase } from './config/database';
import redisManager from './config/redis';

// Import des routes
import authRoutes from './routes/auth';
// import userRoutes from './routes/users';

interface CustomError extends Error {
  status?: number;
  statusCode?: number;
}

class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    // Sécurité de base avec Helmet
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // CORS configuration
    const corsOptions: cors.CorsOptions = {
      origin: (origin, callback) => {
        // Permettre les requêtes sans origin (comme les apps mobiles)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
          config.FRONTEND_URL,
          'http://localhost:3000',
          'http://localhost:3002',
        ];

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn(`🚫 CORS blocked origin: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cache-Control',
      ],
    };

    this.app.use(cors(corsOptions));

    // Compression
    this.app.use(compression());

    // Parsing du body
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS, // 15 minutes par défaut
      max: config.RATE_LIMIT_MAX_REQUESTS, // 100 requêtes par défaut
      message: {
        error: 'Trop de requêtes, veuillez réessayer plus tard.',
        retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000),
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health' || req.path === '/api/v1/health';
      },
    });

    this.app.use(limiter);

    // Logging HTTP avec Morgan
    const morganFormat = config.NODE_ENV === 'production' ? 'combined' : 'dev';
    this.app.use(morgan(morganFormat, { stream: morganStream }));

    // Trust proxy pour les headers comme X-Forwarded-For
    this.app.set('trust proxy', 1);
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'OK',
        message: 'PME 360 Backend is running',
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV,
        uptime: process.uptime(),
      });
    });

    // API routes avec préfixe
    this.app.get(config.API_PREFIX, (req: Request, res: Response) => {
      res.json({
        message: 'PME 360 API v1',
        version: '1.0.0',
        status: 'active',
        endpoints: {
          auth: `${config.API_PREFIX}/auth`,
          users: `${config.API_PREFIX}/users`,
          opportunities: `${config.API_PREFIX}/opportunities`,
          messages: `${config.API_PREFIX}/messages`,
          resources: `${config.API_PREFIX}/resources`,
          events: `${config.API_PREFIX}/events`,
          notifications: `${config.API_PREFIX}/notifications`,
        },
      });
    });

    // Mounting routes
    this.app.use(`${config.API_PREFIX}/auth`, authRoutes);
    // this.app.use(`${config.API_PREFIX}/users`, userRoutes);

    // Route pour les endpoints non trouvés
    this.app.use('*', (req: Request, res: Response) => {
      logger.warn(`🔍 404 - Route not found: ${req.method} ${req.originalUrl}`);
      res.status(404).json({
        error: 'Route not found',
        message: `The endpoint ${req.method} ${req.originalUrl} does not exist`,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private initializeErrorHandling(): void {
    // Gestionnaire d'erreur global
    this.app.use((error: CustomError, req: Request, res: Response, next: NextFunction) => {
      const status = error.status || error.statusCode || 500;
      const message = error.message || 'Une erreur interne s\'est produite';

      // Logger l'erreur
      logger.error(`🚨 ${status} Error:`, {
        message: error.message,
        stack: error.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      // Réponse d'erreur
      const errorResponse: any = {
        error: message,
        status,
        timestamp: new Date().toISOString(),
      };

      // En développement, inclure la stack trace
      if (config.NODE_ENV === 'development') {
        errorResponse.stack = error.stack;
      }

      res.status(status).json(errorResponse);
    });

    // Gestionnaire pour les promesses rejetées non capturées
    process.on('unhandledRejection', (reason: any) => {
      logger.error('🚨 Unhandled Promise Rejection:', reason);
    });

    // Gestionnaire pour les exceptions non capturées
    process.on('uncaughtException', (error: Error) => {
      logger.error('🚨 Uncaught Exception:', error);
      process.exit(1);
    });

    // Gestionnaire pour l'arrêt graceful
    process.on('SIGTERM', () => {
      logger.info('🛑 SIGTERM received, shutting down gracefully');
      this.gracefulShutdown();
    });

    process.on('SIGINT', () => {
      logger.info('🛑 SIGINT received, shutting down gracefully');
      this.gracefulShutdown();
    });
  }

  private async gracefulShutdown(): Promise<void> {
    logger.info('🔄 Starting graceful shutdown...');

    try {
      // Fermer les connexions base de données et Redis
      await Promise.all([
        // connectDatabase close sera implémenté
        redisManager.disconnect(),
      ]);

      logger.info('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  public async initialize(): Promise<void> {
    try {
      // Connexion à la base de données
      await connectDatabase();
      
      // Connexion à Redis
      await redisManager.connect();

      logger.info('✅ App initialization completed');
    } catch (error) {
      logger.error('❌ App initialization failed:', error);
      process.exit(1);
    }
  }

  public getExpressApp(): Application {
    return this.app;
  }
}

export default App;