import express, { Request, Response } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { SimpleAuthService } from './services/simple-auth';
import { SimpleJWTService } from './utils/simple-jwt';
import { PasswordService } from './utils/password';
import { UsersService } from './services/users';

const app = express();
const prisma = new PrismaClient();
const PORT = 3000;

// Middlewares de base
app.use(cors());
app.use(express.json());

// ==================== ROUTES AUTH ====================

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    message: 'PME 360 Backend is running',
    timestamp: new Date().toISOString(),
  });
});

// Test DB
app.get('/api/v1/test-db', async (req: Request, res: Response) => {
  try {
    await prisma.$connect();
    const userCount = await prisma.user.count();
    
    res.json({
      success: true,
      message: 'Database connection successful',
      stats: { totalUsers: userCount },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Register
app.post('/api/v1/auth/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, profileType, company, location } = req.body;

    if (!name || !email || !password || !profileType) {
      res.status(400).json({
        success: false,
        error: 'Nom, email, mot de passe et type de profil sont requis',
      });
      return;
    }

    const result = await SimpleAuthService.register({
      name, email, password, profileType, company, location
    });

    res.status(201).json({
      success: true,
      message: 'Inscription réussie',
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Login
app.post('/api/v1/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: 'Email et mot de passe requis',
      });
      return;
    }

    const result = await SimpleAuthService.login({ email, password });

    res.json({
      success: true,
      message: 'Connexion réussie',
      data: result,
    });
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: error.message,
    });
  }
});

// Get profile
app.get('/api/v1/auth/profile', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = SimpleJWTService.extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Token requis',
      });
      return;
    }

    const payload = SimpleJWTService.verifyAccessToken(token);
    if (!payload) {
      res.status(401).json({
        success: false,
        error: 'Token invalide',
      });
      return;
    }

    const user = await SimpleAuthService.getUserById(payload.userId);

    res.json({
      success: true,
      data: { user },
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
});

// ==================== ROUTES USERS ====================

// Get all users
app.get('/api/v1/users', async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '10',
      profileType,
      location,
      search,
    } = req.query;

    const filters = {
      profileType: profileType as string,
      location: location as string,
      search: search as string,
    };

    const pagination = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 50),
      sortBy: 'createdAt',
      sortOrder: 'desc' as 'desc',
    };

    const result = await UsersService.getAllUsers(filters, pagination);

    res.json({
      success: true,
      data: result.users,
      meta: result.meta,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get user by ID
app.get('/api/v1/users/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const user = await UsersService.getUserById(userId);

    res.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    if (error.message === 'Utilisateur non trouvé') {
      res.status(404).json({
        success: false,
        error: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
});

// Update current user
app.put('/api/v1/users/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = SimpleJWTService.extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Token requis',
      });
      return;
    }

    const payload = SimpleJWTService.verifyAccessToken(token);
    if (!payload) {
      res.status(401).json({
        success: false,
        error: 'Token invalide',
      });
      return;
    }

    const updateData = req.body;
    const allowedFields = ['name', 'company', 'location', 'description', 'website', 'linkedin', 'phone'];
    const filteredData: any = {};

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    }

    const updatedUser = await UsersService.updateUser(payload.userId, filteredData);

    res.json({
      success: true,
      message: 'Profil mis à jour',
      data: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// API info
app.get('/api/v1', (req: Request, res: Response) => {
  res.json({
    message: 'PME 360 API v1',
    version: '1.0.0',
    endpoints: {
      'POST /api/v1/auth/register': 'User registration',
      'POST /api/v1/auth/login': 'User login',
      'GET /api/v1/auth/profile': 'Get user profile',
      'GET /api/v1/users': 'List users',
      'GET /api/v1/users/:id': 'Get user by ID',
      'PUT /api/v1/users/me': 'Update profile',
    },
  });
});

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `${req.method} ${req.originalUrl} not found`,
  });
});

// Start server
async function startServer() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    app.listen(PORT, () => {
      console.log('🚀 PME 360 API Server Started');
      console.log('===============================');
      console.log(`✅ Server: http://localhost:${PORT}`);
      console.log(`🔍 Health: http://localhost:${PORT}/health`);
      console.log(`📋 API Info: http://localhost:${PORT}/api/v1`);
      console.log('');
      console.log('📌 Available Endpoints:');
      console.log('   POST /api/v1/auth/register');
      console.log('   POST /api/v1/auth/login');
      console.log('   GET  /api/v1/auth/profile');
      console.log('   GET  /api/v1/users');
      console.log('   GET  /api/v1/users/:id');
      console.log('   PUT  /api/v1/users/me');
      console.log('===============================');
    });
  } catch (error) {
    console.error('❌ Server start failed:', error);
    process.exit(1);
  }
}

startServer();