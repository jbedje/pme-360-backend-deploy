import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';

// Import des routes
import authRoutes from './routes/simple-auth';
import usersRoutes from './routes/simple-users';

// Configuration
const app = express();
const prisma = new PrismaClient();
const PORT = 3003;
const API_PREFIX = '/api/v1';

// ==================== MIDDLEWARES ====================

// Sécurité de base
app.use(helmet({
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

// CORS
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3002',
    'http://localhost:3001',
  ],
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
}));

// Compression
app.use(compression());

// Parsing du body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging HTTP
app.use(morgan('combined'));

// Trust proxy
app.set('trust proxy', 1);

// ==================== ROUTES ====================

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'PME 360 Backend API is running',
    timestamp: new Date().toISOString(),
    environment: 'development',
    uptime: process.uptime(),
  });
});

// API Info
app.get(API_PREFIX, (req: Request, res: Response) => {
  res.json({
    message: 'PME 360 API v1',
    version: '1.0.0',
    status: 'active',
    documentation: 'https://api.pme360.com/docs',
    endpoints: {
      auth: `${API_PREFIX}/auth`,
      users: `${API_PREFIX}/users`,
      health: '/health',
    },
  });
});

// API Routes
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, usersRoutes);

// Database test endpoint
app.get(`${API_PREFIX}/test-db`, async (req: Request, res: Response) => {
  try {
    await prisma.$connect();
    
    const userCount = await prisma.user.count();
    
    res.json({
      success: true,
      message: 'Database connection successful',
      stats: {
        totalUsers: userCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// 404 Handler
app.use('*', (req: Request, res: Response) => {
  console.log(`🔍 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `The endpoint ${req.method} ${req.originalUrl} does not exist`,
    availableEndpoints: {
      health: 'GET /health',
      api: `GET ${API_PREFIX}`,
      auth: `${API_PREFIX}/auth/*`,
      users: `${API_PREFIX}/users/*`,
    },
    timestamp: new Date().toISOString(),
  });
});

// Error Handler
app.use((error: any, req: Request, res: Response, next: any) => {
  const status = error.status || error.statusCode || 500;
  const message = error.message || 'Une erreur interne s\'est produite';

  console.error(`🚨 ${status} Error:`, {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  res.status(status).json({
    success: false,
    error: message,
    status,
    timestamp: new Date().toISOString(),
  });
});

// ==================== SERVER STARTUP ====================

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    // Start server
    const server = app.listen(PORT, () => {
      console.log('🚀 PME 360 Backend API Server Started');
      console.log('=====================================');
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌐 Environment: development`);
      console.log(`📡 API Base URL: http://localhost:${PORT}${API_PREFIX}`);
      console.log(`🔍 Health Check: http://localhost:${PORT}/health`);
      console.log('');
      console.log('📋 Available Endpoints:');
      console.log(`   POST ${API_PREFIX}/auth/register - User registration`);
      console.log(`   POST ${API_PREFIX}/auth/login - User login`);
      console.log(`   GET  ${API_PREFIX}/auth/profile - Get user profile`);
      console.log(`   GET  ${API_PREFIX}/users - List users`);
      console.log(`   GET  ${API_PREFIX}/users/:id - Get user by ID`);
      console.log(`   PUT  ${API_PREFIX}/users/me - Update own profile`);
      console.log('=====================================');
    });

    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      console.log(`\n🛑 ${signal} received, shutting down gracefully`);
      
      server.close(async () => {
        console.log('✅ HTTP server closed');
        await prisma.$disconnect();
        console.log('✅ Database disconnected');
        process.exit(0);
      });

      setTimeout(() => {
        console.error('❌ Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();