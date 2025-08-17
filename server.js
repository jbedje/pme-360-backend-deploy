const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Prisma safely
let prisma = null;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
  console.log('✅ Prisma client initialized');
} catch (error) {
  console.warn('⚠️ Prisma client failed to initialize:', error.message);
}

// Middleware
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'https://pme-360.vercel.app',
    'https://*.vercel.app'
  ],
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'PME 360 API is running',
    database: prisma ? 'connected' : 'not connected',
    port: PORT
  });
});

// Database diagnostic endpoint
app.get('/api/db/status', async (req, res) => {
  try {
    if (!prisma) {
      return res.json({ 
        success: false, 
        prisma: 'not initialized',
        databaseUrl: process.env.DATABASE_URL ? 'set' : 'not set'
      });
    }

    // Test basic connection
    let connectionTest = 'failed';
    let rawQueryTest = 'failed';
    let userCountTest = 'failed';

    try {
      await prisma.$connect();
      connectionTest = 'success';
    } catch (error) {
      connectionTest = error.message;
    }

    try {
      await prisma.$queryRaw`SELECT 1 as test`;
      rawQueryTest = 'success';
    } catch (error) {
      rawQueryTest = error.message;
    }

    try {
      const count = await prisma.user.count();
      userCountTest = `success: ${count} users`;
    } catch (error) {
      userCountTest = error.message;
    }

    res.json({
      success: true,
      diagnostics: {
        prisma: 'initialized',
        databaseUrl: process.env.DATABASE_URL ? 'set' : 'not set',
        databaseUrlPreview: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) + '...' : 'not set',
        connectionTest,
        rawQueryTest,
        userCountTest
      }
    });

  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      diagnostics: {
        prisma: prisma ? 'initialized' : 'not initialized',
        databaseUrl: process.env.DATABASE_URL ? 'set' : 'not set'
      }
    });
  }
});

// Simple database initialization via GET (easier to trigger)
app.get('/api/init-db', async (req, res) => {
  try {
    if (!prisma) {
      return res.status(503).json({ 
        success: false, 
        error: 'Database not available' 
      });
    }

    console.log('🚀 Starting simple database initialization...');

    // Check if database is already initialized
    try {
      const userCount = await prisma.user.count();
      if (userCount > 0) {
        return res.json({
          success: true,
          message: `Database already initialized with ${userCount} users`,
          alreadyInitialized: true
        });
      }
    } catch (error) {
      console.log('⚠️ Tables may not exist yet, proceeding with initialization...');
    }

    const bcrypt = require('bcryptjs');

    // Create admin user
    const hashedAdminPassword = await bcrypt.hash('admin123', 10);
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@pme360.com' },
      update: {},
      create: {
        email: 'admin@pme360.com',
        name: 'Admin PME360',
        password: hashedAdminPassword,
        profileType: 'ADMIN',
        status: 'ACTIVE',
        company: 'PME 360',
        verified: true,
        completionScore: 100,
      },
    });

    // Create test user  
    const hashedTestPassword = await bcrypt.hash('password123', 10);
    const testUser = await prisma.user.upsert({
      where: { email: 'test@example.com' },
      update: {},
      create: {
        email: 'test@example.com',
        name: 'Test User',
        password: hashedTestPassword,
        profileType: 'STARTUP',
        status: 'ACTIVE',
        company: 'Test Company',
        verified: true,
        completionScore: 75,
      },
    });

    console.log('✅ Database initialized successfully!');
    res.json({ 
      success: true, 
      message: 'Database initialized successfully!',
      data: {
        users: 2,
        adminEmail: 'admin@pme360.com',
        testEmail: 'test@example.com'
      }
    });

  } catch (error) {
    console.error('❌ Database initialization error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Database initialization failed',
      details: error.message
    });
  }
});

// Basic API routes
app.get('/api/test', (req, res) => {
  res.json({ message: 'PME 360 API is working!' });
});

// Users route
app.get('/api/users', async (req, res) => {
  try {
    if (!prisma) {
      return res.status(503).json({ 
        success: false, 
        error: 'Database not available' 
      });
    }
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        profileType: true,
        company: true,
        isActive: true,
        createdAt: true
      }
    });
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Users error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// Auth login route
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email et mot de passe requis' 
      });
    }

    // Simple authentication (replace with real authentication later)
    if (email === 'admin@pme360.com' && password === 'admin123') {
      const user = {
        id: 1,
        email: 'admin@pme360.com',
        firstName: 'Admin',
        lastName: 'PME360',
        profileType: 'admin',
        company: 'PME 360',
        isActive: true
      };
      
      const token = 'simple-jwt-token-' + Date.now();
      
      return res.json({
        success: true,
        data: {
          user,
          token
        },
        message: 'Connexion réussie'
      });
    }

    // Test user
    if (email === 'test@example.com' && password === 'password123') {
      const user = {
        id: 2,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        profileType: 'entrepreneur',
        company: 'Test Company',
        isActive: true
      };
      
      const token = 'simple-jwt-token-' + Date.now();
      
      return res.json({
        success: true,
        data: {
          user,
          token
        },
        message: 'Connexion réussie'
      });
    }

    return res.status(401).json({ 
      success: false, 
      message: 'Email ou mot de passe incorrect' 
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur lors de la connexion' 
    });
  }
});

// Auth test route
app.post('/api/auth/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Auth endpoint is working',
    timestamp: new Date().toISOString()
  });
});

// Database setup route (for initial deployment)
app.post('/api/db/setup', async (req, res) => {
  try {
    if (!prisma) {
      return res.status(503).json({ 
        success: false, 
        error: 'Database not available' 
      });
    }

    console.log('🚀 Starting manual database seeding...');

    // Manual seeding using Prisma client directly
    const bcrypt = require('bcryptjs');

    // Create admin user
    const hashedAdminPassword = await bcrypt.hash('admin123', 10);
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@pme360.com' },
      update: {},
      create: {
        email: 'admin@pme360.com',
        name: 'Admin PME360',
        password: hashedAdminPassword,
        profileType: 'ADMIN',
        status: 'ACTIVE',
        company: 'PME 360',
        verified: true,
        completionScore: 100,
      },
    });

    // Create test user
    const hashedTestPassword = await bcrypt.hash('password123', 10);
    const testUser = await prisma.user.upsert({
      where: { email: 'test@example.com' },
      update: {},
      create: {
        email: 'test@example.com',
        name: 'Test User',
        password: hashedTestPassword,
        profileType: 'STARTUP',
        status: 'ACTIVE',
        company: 'Test Company',
        verified: true,
        completionScore: 75,
      },
    });

    // Create sample opportunity
    const opportunity = await prisma.opportunity.create({
      data: {
        title: 'Développeur Full-Stack React/Node.js',
        description: 'Recherche développeur expérimenté pour projet fintech innovant.',
        type: 'TALENT',
        status: 'ACTIVE',
        budget: '50k-70k€',
        location: 'Paris',
        remote: true,
        authorId: adminUser.id,
        skills: {
          create: [
            { skill: 'React' },
            { skill: 'Node.js' },
            { skill: 'TypeScript' }
          ]
        }
      },
    });

    // Create sample event
    const event = await prisma.event.create({
      data: {
        title: 'Conférence FinTech Paris 2024',
        description: 'La plus grande conférence européenne dédiée aux innovations financières.',
        type: 'CONFERENCE',
        status: 'UPCOMING',
        startDate: new Date('2024-09-25T09:00:00Z'),
        endDate: new Date('2024-09-25T18:00:00Z'),
        location: 'Palais des Congrès, Paris',
        isOnline: false,
        maxAttendees: 500,
        price: '150€',
        organizer: 'FinTech Europe',
        organizerContact: 'contact@fintecheurope.com',
      },
    });

    // Create sample resource
    const resource = await prisma.resource.create({
      data: {
        title: 'Guide complet de création d\'entreprise',
        description: 'Guide détaillé pour créer son entreprise en France.',
        type: 'GUIDE',
        author: 'Marie Dubois',
        viewCount: 1247,
        url: 'https://example.com/guide-creation-entreprise.pdf',
        tags: {
          create: [
            { tag: 'Création' },
            { tag: 'Administratif' },
            { tag: 'Business Plan' }
          ]
        }
      },
    });

    console.log('✅ Database seeded successfully!');
    res.json({ 
      success: true, 
      message: 'Database seeded successfully via Prisma client',
      data: {
        users: 2,
        opportunities: 1,
        events: 1,
        resources: 1
      }
    });

  } catch (error) {
    console.error('❌ Database setup error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Database setup failed',
      details: error.message
    });
  }
});

// Enhanced users route with real database
app.get('/api/users', async (req, res) => {
  try {
    if (!prisma) {
      return res.status(503).json({ 
        success: false, 
        error: 'Database not available' 
      });
    }
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        profileType: true,
        company: true,
        status: true,
        verified: true,
        completionScore: true,
        createdAt: true
      }
    });
    
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Users error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch users',
      details: error.message 
    });
  }
});

// Enhanced opportunities route
app.get('/api/opportunities', async (req, res) => {
  try {
    if (!prisma) {
      return res.status(503).json({ 
        success: false, 
        error: 'Database not available' 
      });
    }
    
    const opportunities = await prisma.opportunity.findMany({
      include: {
        author: {
          select: {
            id: true,
            name: true,
            company: true,
            profileType: true
          }
        },
        skills: true,
        applications: {
          select: {
            id: true,
            status: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    res.json({ success: true, data: opportunities });
  } catch (error) {
    console.error('Opportunities error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch opportunities',
      details: error.message 
    });
  }
});

// Events route
app.get('/api/events', async (req, res) => {
  try {
    if (!prisma) {
      return res.status(503).json({ 
        success: false, 
        error: 'Database not available' 
      });
    }
    
    const events = await prisma.event.findMany({
      include: {
        registrations: {
          select: {
            id: true,
            userId: true
          }
        }
      },
      orderBy: {
        startDate: 'asc'
      }
    });
    
    res.json({ success: true, data: events });
  } catch (error) {
    console.error('Events error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch events',
      details: error.message 
    });
  }
});

// Resources route
app.get('/api/resources', async (req, res) => {
  try {
    if (!prisma) {
      return res.status(503).json({ 
        success: false, 
        error: 'Database not available' 
      });
    }
    
    const resources = await prisma.resource.findMany({
      include: {
        tags: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    res.json({ success: true, data: resources });
  } catch (error) {
    console.error('Resources error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch resources',
      details: error.message 
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Something broke!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Database initialization function
async function initializeDatabase() {
  if (!prisma) {
    console.log('⚠️ Prisma not available, skipping database initialization');
    return;
  }

  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection test successful');

    // Check if User table exists and has data
    const userCount = await prisma.user.count();
    console.log(`📊 Found ${userCount} users in database`);

    if (userCount === 0) {
      console.log('🌱 No users found, database may need seeding');
      console.log('💡 You can run: POST /api/db/setup to initialize data');
    }

  } catch (error) {
    console.log('⚠️ Database initialization check failed:', error.message);
    console.log('💡 Database tables may not exist yet. You can run: POST /api/db/setup');
  }
}

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 PME 360 API Server running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Database URL: ${process.env.DATABASE_URL ? 'Set' : 'Not set'}`);
  
  // Initialize database
  await initializeDatabase();
});

module.exports = app;