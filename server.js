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

    // Try to push schema to database
    const { exec } = require('child_process');
    
    exec('npx prisma db push --accept-data-loss', (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Database push error:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Database setup failed',
          details: error.message
        });
      }

      // After successful schema push, run seeding
      exec('npm run prisma:seed', (seedError, seedStdout, seedStderr) => {
        if (seedError) {
          console.error('⚠️ Seeding error:', seedError);
          return res.json({ 
            success: true, 
            message: 'Database schema created but seeding failed',
            details: seedError.message
          });
        }

        console.log('✅ Database setup completed successfully');
        res.json({ 
          success: true, 
          message: 'Database setup and seeding completed successfully',
          details: {
            push: stdout,
            seed: seedStdout
          }
        });
      });
    });

  } catch (error) {
    console.error('Database setup error:', error);
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 PME 360 API Server running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Database URL: ${process.env.DATABASE_URL ? 'Set' : 'Not set'}`);
});

module.exports = app;