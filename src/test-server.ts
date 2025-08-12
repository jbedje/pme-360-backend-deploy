import express, { Request, Response } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const PORT = 3003;

// Middlewares de base
app.use(cors());
app.use(express.json());

// Route de test simple
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    message: 'PME 360 Backend Test Server is running',
    timestamp: new Date().toISOString(),
  });
});

// Route pour tester la base de données
app.get('/test-db', async (req: Request, res: Response) => {
  try {
    // Test simple de la base de données
    await prisma.$connect();
    
    res.json({
      success: true,
      message: 'Database connection successful',
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

// Route pour créer un utilisateur de test
app.post('/test-user', async (req: Request, res: Response) => {
  try {
    const testUser = await prisma.user.create({
      data: {
        name: 'Utilisateur Test',
        email: `test-${Date.now()}@pme360.com`,
        password: 'hashedpassword123',
        profileType: 'STARTUP',
        company: 'Ma Startup',
        location: 'Paris, France',
      },
    });

    res.json({
      success: true,
      message: 'Test user created successfully',
      data: {
        id: testUser.id,
        name: testUser.name,
        email: testUser.email,
        profileType: testUser.profileType,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create test user',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Route pour lister les utilisateurs
app.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        profileType: true,
        company: true,
        location: true,
        verified: true,
        createdAt: true,
      },
      take: 10, // Limiter à 10 utilisateurs
    });

    res.json({
      success: true,
      data: users,
      count: users.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`✅ Test server is running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Test DB: http://localhost:${PORT}/test-db`);
  console.log(`👤 Create test user: POST http://localhost:${PORT}/test-user`);
  console.log(`📋 List users: http://localhost:${PORT}/users`);
});

// Gestion graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});