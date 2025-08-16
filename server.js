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