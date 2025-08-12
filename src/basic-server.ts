import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { SimpleAuthService } from './services/simple-auth';
import { SimpleJWTService } from './utils/simple-jwt';
import { UsersService } from './services/users';
import { SimpleMessagingService } from './services/simple-messaging';
import { OpportunitiesService } from './services/opportunities';
import { ResourcesService } from './services/resources';
import { EventsService } from './services/events';
import { NotificationsService } from './services/notifications';
import { WebSocketNotificationService } from './services/websocket';
import { FileUploadService, FileType } from './services/file-upload';
import { AnalyticsService } from './services/analytics';
import { MonitoringService } from './services/monitoring';
import { AuditService, AuditActions } from './services/audit';

// Security middleware imports
import { 
  securityHeaders, 
  generalRateLimit, 
  authRateLimit, 
  uploadRateLimit, 
  messageRateLimit,
  analyticsRateLimit,
  speedLimiter,
  compressionMiddleware,
  attackDetection,
  botDetection,
  ipBlacklist,
  auditLog,
  corsOptions 
} from './middleware/security';

// Validation middleware imports
import { validate, validateFileUpload, sanitizeInput, validatePermissions } from './middleware/validation';

// Validation schemas imports
import {
  loginSchema,
  registerSchema,
  updateUserSchema,
  sendMessageSchema,
  createOpportunitySchema,
  applyToOpportunitySchema,
  createResourceSchema,
  createEventSchema,
  createNotificationSchema,
  paginationSchema,
  userFiltersSchema,
  opportunityFiltersSchema,
  eventFiltersSchema,
  resourceFiltersSchema,
  messageFiltersSchema,
  notificationFiltersSchema,
  analyticsUserMetricsSchema,
  analyticsTrendsSchema,
  fileUploadSchema,
  idParamSchema,
  userIdParamSchema,
  opportunityIdParamSchema,
  eventIdParamSchema,
  resourceIdParamSchema,
  messageIdParamSchema,
  notificationIdParamSchema
} from './validation/schemas';

const app = express();
const prisma = new PrismaClient();
const PORT = 3000;

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// ==================== SECURITY MIDDLEWARE ====================
app.use(securityHeaders);
app.use(compressionMiddleware);
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(ipBlacklist);
app.use(botDetection);
app.use(attackDetection);
app.use(sanitizeInput);
app.use(speedLimiter);
app.use(auditLog);
app.use(MonitoringService.requestMetricsMiddleware());

// Interface for authenticated requests
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    profileType: string;
    verified: boolean;
  };
}

// ==================== AUTHENTICATION MIDDLEWARE ====================

// Authentication middleware
const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: Function) => {
  try {
    const authHeader = req.headers.authorization;
    const token = SimpleJWTService.extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Token requis',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const payload = SimpleJWTService.verifyAccessToken(token);
    if (!payload) {
      res.status(401).json({
        success: false,
        error: 'Token invalide',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    req.user = {
      id: payload.userId,
      email: payload.email,
      profileType: payload.profileType,
      verified: payload.verified,
    };

    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: 'Token invalide',
      timestamp: new Date().toISOString(),
    });
  }
};

// ==================== MONITORING & HEALTH ENDPOINTS ====================

// Enhanced health check with detailed system status
app.get('/health', async (req: Request, res: Response) => {
  try {
    const healthStatus = await MonitoringService.getHealthStatus();
    
    const statusCode = healthStatus.status === 'healthy' ? 200 : 
                      healthStatus.status === 'degraded' ? 207 : 503;
    
    res.status(statusCode).json(healthStatus);
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      message: 'Health check failed',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Monitoring dashboard endpoint (admin only)
app.get('/api/v1/monitoring/dashboard', 
  generalRateLimit,
  authenticateToken,
  validatePermissions(['admin']),
  async (req: Request, res: Response) => {
    try {
      const [healthStatus, dbMetrics, alerts] = await Promise.all([
        MonitoringService.getHealthStatus(),
        MonitoringService.getDatabaseMetrics(),
        MonitoringService.checkAlerts()
      ]);

      res.json({
        success: true,
        data: {
          health: healthStatus,
          database: dbMetrics,
          alerts: alerts,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// Test DB with enhanced security
app.get('/api/v1/test-db', 
  generalRateLimit,
  async (req: Request, res: Response) => {
    try {
      await AuditService.logSecurityEvent(
        AuditActions.SUSPICIOUS_ACTIVITY,
        'Database test endpoint accessed',
        req.ip,
        req.get('User-Agent')
      );

      await prisma.$connect();
      const userCount = await prisma.user.count();
      
      res.json({
        success: true,
        message: 'Database connection successful',
        stats: { totalUsers: userCount },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// ==================== AUTHENTICATION ENDPOINTS ====================

// Register with validation and rate limiting
app.post('/api/v1/auth/register', 
  authRateLimit,
  validate({ body: registerSchema }),
  async (req: Request, res: Response) => {
    try {
      const registrationData = req.body;

      const result = await SimpleAuthService.register(registrationData);

      // Log successful registration
      await AuditService.logAuthentication(
        AuditActions.REGISTER,
        result.user.id,
        true,
        req.ip,
        req.get('User-Agent')
      );

      res.status(201).json({
        success: true,
        message: 'Inscription réussie',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      // Log failed registration attempt
      await AuditService.logAuthentication(
        AuditActions.REGISTER,
        'unknown',
        false,
        req.ip,
        req.get('User-Agent'),
        error.message
      );

      res.status(400).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// Login with validation and rate limiting
app.post('/api/v1/auth/login', 
  authRateLimit,
  validate({ body: loginSchema }),
  async (req: Request, res: Response) => {
    try {
      const loginData = req.body;
      const result = await SimpleAuthService.login(loginData);

      // Log successful login
      await AuditService.logAuthentication(
        AuditActions.LOGIN,
        result.user.id,
        true,
        req.ip,
        req.get('User-Agent')
      );

      res.json({
        success: true,
        message: 'Connexion réussie',
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      // Log failed login attempt
      await AuditService.logAuthentication(
        AuditActions.LOGIN,
        'unknown',
        false,
        req.ip,
        req.get('User-Agent'),
        error.message
      );

      res.status(401).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// Get profile
app.get('/api/v1/auth/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const user = await SimpleAuthService.getUserById(req.user.id);

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
app.put('/api/v1/users/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
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

    const updatedUser = await UsersService.updateUser(req.user.id, filteredData);

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

// ==================== MESSAGING ENDPOINTS ====================

// Send message with validation and rate limiting
app.post('/api/v1/messages', 
  messageRateLimit,
  authenticateToken, 
  validate({ body: sendMessageSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Utilisateur non authentifié',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const messageData = req.body;
      const message = await SimpleMessagingService.sendMessage(req.user.id, messageData);

      // Log message sending for audit
      await AuditService.logResourceAction(
        AuditActions.MESSAGE_SEND,
        req.user.id,
        'MESSAGE',
        message.id,
        { recipientId: messageData.recipientId, type: messageData.type },
        req.ip,
        req.get('User-Agent')
      );

    res.status(201).json({
      success: true,
      message: 'Message envoyé avec succès',
      data: message,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Get received messages
app.get('/api/v1/messages/received', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const {
      page = '1',
      limit = '10',
      type,
      status,
      search,
    } = req.query;

    const filters = { type: type as string, status: status as string, search: search as string };
    const pagination = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 50),
      sortBy: 'createdAt',
      sortOrder: 'desc' as 'desc',
    };

    const result = await SimpleMessagingService.getMessages(req.user.id, filters, pagination, 'received');

    res.json({
      success: true,
      data: result.messages,
      meta: result.meta,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get sent messages
app.get('/api/v1/messages/sent', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const {
      page = '1',
      limit = '10',
      type,
      status,
      search,
    } = req.query;

    const filters = { type: type as string, status: status as string, search: search as string };
    const pagination = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 50),
      sortBy: 'createdAt',
      sortOrder: 'desc' as 'desc',
    };

    const result = await SimpleMessagingService.getMessages(req.user.id, filters, pagination, 'sent');

    res.json({
      success: true,
      data: result.messages,
      meta: result.meta,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get conversations
app.get('/api/v1/messages/conversations', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const {
      page = '1',
      limit = '20',
    } = req.query;

    const pagination = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 50),
    };

    const result = await SimpleMessagingService.getConversations(req.user.id, pagination);

    res.json({
      success: true,
      data: result.conversations,
      meta: result.meta,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get message by ID
app.get('/api/v1/messages/:messageId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { messageId } = req.params;
    const message = await SimpleMessagingService.getMessageById(messageId, req.user.id);

    res.json({
      success: true,
      data: message,
    });
  } catch (error: any) {
    if (error.message === 'Message non trouvé') {
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

// Mark message as read
app.put('/api/v1/messages/:messageId/read', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { messageId } = req.params;
    const message = await SimpleMessagingService.markAsRead(messageId, req.user.id);

    res.json({
      success: true,
      message: 'Message marqué comme lu',
      data: message,
    });
  } catch (error: any) {
    if (error.message === 'Message non trouvé') {
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

// Delete message
app.delete('/api/v1/messages/:messageId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { messageId } = req.params;
    const result = await SimpleMessagingService.deleteMessage(messageId, req.user.id);

    res.json({
      success: true,
      message: 'Message supprimé avec succès',
      data: result,
    });
  } catch (error: any) {
    if (error.message === 'Message non trouvé') {
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

// Get unread count
app.get('/api/v1/messages/unread/count', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const result = await SimpleMessagingService.getUnreadCount(req.user.id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==================== OPPORTUNITIES ENDPOINTS ====================

// Create opportunity
app.post('/api/v1/opportunities', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { title, description, type, budget, amount, location, remote, deadline, startDate, skills, experience } = req.body;

    if (!title || !description || !type) {
      res.status(400).json({
        success: false,
        error: 'Titre, description et type sont requis',
      });
      return;
    }

    const opportunity = await OpportunitiesService.createOpportunity(req.user.id, {
      title, description, type, budget, amount, location, remote,
      deadline: deadline ? new Date(deadline) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      skills, experience
    });

    res.status(201).json({
      success: true,
      message: 'Opportunité créée avec succès',
      data: opportunity,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Get opportunities
app.get('/api/v1/opportunities', async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '10',
      type,
      status,
      location,
      remote,
      skills,
      search,
      authorId,
    } = req.query;

    const filters = {
      type: type as string,
      status: status as string,
      location: location as string,
      remote: remote === 'true' ? true : remote === 'false' ? false : undefined,
      skills: skills as string,
      search: search as string,
      authorId: authorId as string,
    };

    const pagination = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 50),
      sortBy: 'createdAt',
      sortOrder: 'desc' as 'desc',
    };

    const result = await OpportunitiesService.getOpportunities(filters, pagination);

    res.json({
      success: true,
      data: result.opportunities,
      meta: result.meta,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get opportunity by ID
app.get('/api/v1/opportunities/:opportunityId', async (req: Request, res: Response) => {
  try {
    const { opportunityId } = req.params;
    let userId: string | undefined;
    if (req.headers.authorization) {
      const token = SimpleJWTService.extractTokenFromHeader(req.headers.authorization);
      if (token) {
        const payload = SimpleJWTService.verifyAccessToken(token);
        userId = payload?.userId;
      }
    }

    const opportunity = await OpportunitiesService.getOpportunityById(opportunityId, userId);

    res.json({
      success: true,
      data: opportunity,
    });
  } catch (error: any) {
    if (error.message === 'Opportunité non trouvée') {
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

// Update opportunity
app.put('/api/v1/opportunities/:opportunityId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { opportunityId } = req.params;
    const updateData = req.body;

    // Convert date strings to Date objects if provided
    if (updateData.deadline) updateData.deadline = new Date(updateData.deadline);
    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);

    const opportunity = await OpportunitiesService.updateOpportunity(opportunityId, req.user.id, updateData);

    res.json({
      success: true,
      message: 'Opportunité mise à jour avec succès',
      data: opportunity,
    });
  } catch (error: any) {
    if (error.message === 'Opportunité non trouvée') {
      res.status(404).json({
        success: false,
        error: error.message,
      });
    } else if (error.message === 'Non autorisé à modifier cette opportunité') {
      res.status(403).json({
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

// Delete opportunity
app.delete('/api/v1/opportunities/:opportunityId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { opportunityId } = req.params;
    const result = await OpportunitiesService.deleteOpportunity(opportunityId, req.user.id);

    res.json({
      success: true,
      message: 'Opportunité supprimée avec succès',
      data: result,
    });
  } catch (error: any) {
    if (error.message === 'Opportunité non trouvée') {
      res.status(404).json({
        success: false,
        error: error.message,
      });
    } else if (error.message === 'Non autorisé à supprimer cette opportunité') {
      res.status(403).json({
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

// Apply to opportunity
app.post('/api/v1/opportunities/:opportunityId/apply', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { opportunityId } = req.params;
    const { coverLetter, proposedRate, availability } = req.body;

    if (!coverLetter) {
      res.status(400).json({
        success: false,
        error: 'Lettre de motivation requise',
      });
      return;
    }

    const application = await OpportunitiesService.applyToOpportunity(opportunityId, req.user.id, {
      coverLetter, proposedRate, availability
    });

    res.status(201).json({
      success: true,
      message: 'Candidature envoyée avec succès',
      data: application,
    });
  } catch (error: any) {
    if (error.message === 'Opportunité non trouvée') {
      res.status(404).json({
        success: false,
        error: error.message,
      });
    } else if (error.message.includes('déjà postulé') || error.message.includes('propre opportunité') || error.message.includes('plus active')) {
      res.status(400).json({
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

// Get applications for an opportunity (for opportunity author)
app.get('/api/v1/opportunities/:opportunityId/applications', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { opportunityId } = req.params;
    const { page = '1', limit = '10' } = req.query;

    const pagination = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 50),
    };

    const result = await OpportunitiesService.getApplications(opportunityId, req.user.id, pagination);

    res.json({
      success: true,
      data: result.applications,
      meta: result.meta,
    });
  } catch (error: any) {
    if (error.message === 'Opportunité non trouvée') {
      res.status(404).json({
        success: false,
        error: error.message,
      });
    } else if (error.message === 'Non autorisé à voir les candidatures') {
      res.status(403).json({
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

// Get user's applications
app.get('/api/v1/applications/my', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { page = '1', limit = '10' } = req.query;

    const pagination = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 50),
    };

    const result = await OpportunitiesService.getUserApplications(req.user.id, pagination);

    res.json({
      success: true,
      data: result.applications,
      meta: result.meta,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==================== RESOURCES ENDPOINTS ====================

// Create resource
app.post('/api/v1/resources', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { title, description, content, url, thumbnail, type, author, tags, isPremium } = req.body;

    if (!title || !description || !type || !author) {
      res.status(400).json({
        success: false,
        error: 'Titre, description, type et auteur sont requis',
      });
      return;
    }

    // Get user info to use as default author
    const user = await UsersService.getUserById(req.user.id);
    
    const resource = await ResourcesService.createResource({
      title, description, content, url, thumbnail, type, author: author || user.name, tags, isPremium
    });

    res.status(201).json({
      success: true,
      message: 'Ressource créée avec succès',
      data: resource,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Get resources
app.get('/api/v1/resources', async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '10',
      type,
      status,
      category,
      search,
      authorId,
      tags,
    } = req.query;

    const filters = {
      type: type as string,
      author: authorId as string,
      search: search as string,
      tags: tags as string,
      isPremium: category === 'premium' ? true : category === 'free' ? false : undefined,
    };

    const pagination = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 50),
      sortBy: 'createdAt',
      sortOrder: 'desc' as 'desc',
    };

    const result = await ResourcesService.getResources(filters, pagination);

    res.json({
      success: true,
      data: result.resources,
      meta: result.meta,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get resource by ID
app.get('/api/v1/resources/:resourceId', async (req: Request, res: Response) => {
  try {
    const { resourceId } = req.params;
    let userId: string | undefined;
    if (req.headers.authorization) {
      const token = SimpleJWTService.extractTokenFromHeader(req.headers.authorization);
      if (token) {
        const payload = SimpleJWTService.verifyAccessToken(token);
        userId = payload?.userId;
      }
    }

    const resource = await ResourcesService.getResourceById(resourceId, userId ? true : false);

    res.json({
      success: true,
      data: resource,
    });
  } catch (error: any) {
    if (error.message === 'Ressource non trouvée') {
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

// Update resource
app.put('/api/v1/resources/:resourceId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { resourceId } = req.params;
    const updateData = req.body;

    // Get user info for authorization
    const user = await UsersService.getUserById(req.user.id);
    
    const resource = await ResourcesService.updateResource(resourceId, user.name, updateData);

    res.json({
      success: true,
      message: 'Ressource mise à jour avec succès',
      data: resource,
    });
  } catch (error: any) {
    if (error.message === 'Ressource non trouvée') {
      res.status(404).json({
        success: false,
        error: error.message,
      });
    } else if (error.message === 'Non autorisé à modifier cette ressource') {
      res.status(403).json({
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

// Delete resource
app.delete('/api/v1/resources/:resourceId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { resourceId } = req.params;
    // Get user info for authorization
    const user = await UsersService.getUserById(req.user.id);
    
    const result = await ResourcesService.deleteResource(resourceId, user.name);

    res.json({
      success: true,
      message: 'Ressource supprimée avec succès',
      data: result,
    });
  } catch (error: any) {
    if (error.message === 'Ressource non trouvée') {
      res.status(404).json({
        success: false,
        error: error.message,
      });
    } else if (error.message === 'Non autorisé à supprimer cette ressource') {
      res.status(403).json({
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

// Get resources by author
app.get('/api/v1/resources/author/:authorName', async (req: Request, res: Response) => {
  try {
    const { authorName } = req.params;
    const { page = '1', limit = '10' } = req.query;

    const pagination = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 50),
    };

    const result = await ResourcesService.getResourcesByAuthor(authorName, pagination);

    res.json({
      success: true,
      data: result.resources,
      meta: result.meta,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get popular resources
app.get('/api/v1/resources/popular', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '10' } = req.query;

    const pagination = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 50),
    };

    const result = await ResourcesService.getPopularResources(pagination);

    res.json({
      success: true,
      data: result.resources,
      meta: result.meta,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==================== EVENTS ENDPOINTS ====================

// Create event
app.post('/api/v1/events', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { title, description, type, startDate, endDate, location, isOnline, meetingUrl, maxAttendees, price, organizer, organizerContact } = req.body;

    if (!title || !description || !type || !startDate) {
      res.status(400).json({
        success: false,
        error: 'Titre, description, type et date de début sont requis',
      });
      return;
    }

    // Get user info to use as default organizer
    const user = await UsersService.getUserById(req.user.id);
    
    const event = await EventsService.createEvent({
      title, description, type,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : undefined,
      location, isOnline, meetingUrl, maxAttendees, price,
      organizer: organizer || user.name,
      organizerContact
    });

    res.status(201).json({
      success: true,
      message: 'Événement créé avec succès',
      data: event,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Get events
app.get('/api/v1/events', async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '10',
      type,
      status,
      isOnline,
      location,
      upcoming,
      search,
      organizerId,
      tags,
    } = req.query;

    const filters = {
      type: type as string,
      status: status as string,
      isOnline: isOnline === 'true' ? true : isOnline === 'false' ? false : undefined,
      location: location as string,
      upcoming: upcoming === 'true',
      search: search as string,
      organizer: organizerId as string,
    };

    const pagination = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 50),
      sortBy: 'startDate',
      sortOrder: 'asc' as 'asc',
    };

    const result = await EventsService.getEvents(filters, pagination);

    res.json({
      success: true,
      data: result.events,
      meta: result.meta,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get event by ID
app.get('/api/v1/events/:eventId', async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    let userId: string | undefined;
    if (req.headers.authorization) {
      const token = SimpleJWTService.extractTokenFromHeader(req.headers.authorization);
      if (token) {
        const payload = SimpleJWTService.verifyAccessToken(token);
        userId = payload?.userId;
      }
    }

    const event = await EventsService.getEventById(eventId, userId);

    res.json({
      success: true,
      data: event,
    });
  } catch (error: any) {
    if (error.message === 'Événement non trouvé') {
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

// Update event
app.put('/api/v1/events/:eventId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { eventId } = req.params;
    const updateData = req.body;

    // Convert date strings to Date objects if provided
    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
    if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);

    // Get user info for authorization
    const user = await UsersService.getUserById(req.user.id);
    
    const event = await EventsService.updateEvent(eventId, user.name, updateData);

    res.json({
      success: true,
      message: 'Événement mis à jour avec succès',
      data: event,
    });
  } catch (error: any) {
    if (error.message === 'Événement non trouvé') {
      res.status(404).json({
        success: false,
        error: error.message,
      });
    } else if (error.message === 'Non autorisé à modifier cet événement') {
      res.status(403).json({
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

// Delete event
app.delete('/api/v1/events/:eventId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { eventId } = req.params;
    // Get user info for authorization
    const user = await UsersService.getUserById(req.user.id);
    
    const result = await EventsService.deleteEvent(eventId, user.name);

    res.json({
      success: true,
      message: 'Événement supprimé avec succès',
      data: result,
    });
  } catch (error: any) {
    if (error.message === 'Événement non trouvé') {
      res.status(404).json({
        success: false,
        error: error.message,
      });
    } else if (error.message === 'Non autorisé à supprimer cet événement') {
      res.status(403).json({
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

// Register for event
app.post('/api/v1/events/:eventId/register', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { eventId } = req.params;
    const registration = await EventsService.registerForEvent(eventId, req.user.id);

    res.status(201).json({
      success: true,
      message: 'Inscription réussie',
      data: registration,
    });
  } catch (error: any) {
    if (error.message === 'Événement non trouvé') {
      res.status(404).json({
        success: false,
        error: error.message,
      });
    } else if (error.message.includes('déjà inscrit') || error.message.includes('complet') || error.message.includes('passé') || error.message.includes('propre événement') || error.message.includes('pas ouvertes')) {
      res.status(400).json({
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

// Unregister from event
app.delete('/api/v1/events/:eventId/register', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { eventId } = req.params;
    const result = await EventsService.unregisterFromEvent(eventId, req.user.id);

    res.json({
      success: true,
      message: 'Désinscription réussie',
      data: result,
    });
  } catch (error: any) {
    if (error.message === 'Inscription non trouvée') {
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

// Get event registrations (for organizer)
app.get('/api/v1/events/:eventId/registrations', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { eventId } = req.params;
    const { page = '1', limit = '10' } = req.query;

    const pagination = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 50),
    };

    // Get user info for authorization
    const user = await UsersService.getUserById(req.user.id);
    
    const result = await EventsService.getEventRegistrations(eventId, user.name, pagination);

    res.json({
      success: true,
      data: result.registrations,
      meta: result.meta,
    });
  } catch (error: any) {
    if (error.message === 'Événement non trouvé') {
      res.status(404).json({
        success: false,
        error: error.message,
      });
    } else if (error.message === 'Non autorisé à voir les inscriptions') {
      res.status(403).json({
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

// Get user's event registrations
app.get('/api/v1/events/registrations/my', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { page = '1', limit = '10' } = req.query;

    const pagination = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 50),
    };

    const result = await EventsService.getUserRegistrations(req.user.id, pagination);

    res.json({
      success: true,
      data: result.registrations,
      meta: result.meta,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==================== FILE UPLOAD ENDPOINTS ====================

// Upload avatar utilisateur with validation and rate limiting
app.post('/api/v1/upload/avatar', 
  uploadRateLimit,
  authenticateToken,
  upload.single('avatar'),
  validateFileUpload(['image/jpeg', 'image/png', 'image/webp'], 5 * 1024 * 1024, true),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Utilisateur non authentifié',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'Aucun fichier fourni',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Upload vers Cloudinary
      const uploadResult = await FileUploadService.uploadFile(
        req.file,
        FileType.AVATAR,
        req.user!.id
      );

      // Log file upload for audit
      await AuditService.logResourceAction(
        AuditActions.FILE_UPLOAD,
        req.user.id,
        'FILE',
        uploadResult.publicId,
        { fileType: 'avatar', fileSize: req.file.size },
        req.ip,
        req.get('User-Agent')
      );

      // Mettre à jour l'avatar de l'utilisateur en base
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { avatar: uploadResult.url },
      });

      res.json({
        success: true,
        message: 'Avatar mis à jour avec succès',
        data: {
          url: uploadResult.url,
          publicId: uploadResult.publicId,
          responsiveUrls: FileUploadService.generateResponsiveUrls(uploadResult.publicId),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

// Upload thumbnail pour ressource
app.post('/api/v1/upload/resource-thumbnail', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const upload = FileUploadService.createUploadMiddleware(FileType.RESOURCE_THUMBNAIL);
    
    upload.single('thumbnail')(req, res, async (err) => {
      if (err) {
        res.status(400).json({
          success: false,
          error: err.message,
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'Aucun fichier fourni',
        });
        return;
      }

      try {
        const hasQuota = await FileUploadService.checkUserQuota(req.user!.id, req.file.size);
        if (!hasQuota) {
          res.status(413).json({
            success: false,
            error: 'Quota de stockage dépassé',
          });
          return;
        }

        if (!FileUploadService.validateFileType(req.file)) {
          res.status(400).json({
            success: false,
            error: 'Type de fichier non autorisé',
          });
          return;
        }

        const uploadResult = await FileUploadService.uploadFile(
          req.file,
          FileType.RESOURCE_THUMBNAIL,
          req.user!.id
        );

        res.json({
          success: true,
          message: 'Thumbnail uploadé avec succès',
          data: {
            url: uploadResult.url,
            publicId: uploadResult.publicId,
            responsiveUrls: FileUploadService.generateResponsiveUrls(uploadResult.publicId),
          },
        });
      } catch (uploadError: any) {
        res.status(500).json({
          success: false,
          error: uploadError.message,
        });
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Upload pièce jointe pour message
app.post('/api/v1/upload/message-attachment', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const upload = FileUploadService.createUploadMiddleware(FileType.MESSAGE_ATTACHMENT);
    
    upload.single('attachment')(req, res, async (err) => {
      if (err) {
        res.status(400).json({
          success: false,
          error: err.message,
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'Aucun fichier fourni',
        });
        return;
      }

      try {
        const hasQuota = await FileUploadService.checkUserQuota(req.user!.id, req.file.size);
        if (!hasQuota) {
          res.status(413).json({
            success: false,
            error: 'Quota de stockage dépassé',
          });
          return;
        }

        if (!FileUploadService.validateFileType(req.file)) {
          res.status(400).json({
            success: false,
            error: 'Type de fichier non autorisé',
          });
          return;
        }

        const uploadResult = await FileUploadService.uploadFile(
          req.file,
          FileType.MESSAGE_ATTACHMENT,
          req.user!.id
        );

        res.json({
          success: true,
          message: 'Pièce jointe uploadée avec succès',
          data: {
            url: uploadResult.url,
            publicId: uploadResult.publicId,
            filename: req.file.originalname,
            size: uploadResult.size,
            format: uploadResult.format,
          },
        });
      } catch (uploadError: any) {
        res.status(500).json({
          success: false,
          error: uploadError.message,
        });
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Upload image pour événement  
app.post('/api/v1/upload/event-image', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const upload = FileUploadService.createUploadMiddleware(FileType.EVENT_IMAGE);
    
    upload.single('image')(req, res, async (err) => {
      if (err) {
        res.status(400).json({
          success: false,
          error: err.message,
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'Aucun fichier fourni',
        });
        return;
      }

      try {
        const hasQuota = await FileUploadService.checkUserQuota(req.user!.id, req.file.size);
        if (!hasQuota) {
          res.status(413).json({
            success: false,
            error: 'Quota de stockage dépassé',
          });
          return;
        }

        if (!FileUploadService.validateFileType(req.file)) {
          res.status(400).json({
            success: false,
            error: 'Type de fichier non autorisé',
          });
          return;
        }

        const uploadResult = await FileUploadService.uploadFile(
          req.file,
          FileType.EVENT_IMAGE,
          req.user!.id
        );

        res.json({
          success: true,
          message: 'Image d\'événement uploadée avec succès',
          data: {
            url: uploadResult.url,
            publicId: uploadResult.publicId,
            responsiveUrls: FileUploadService.generateResponsiveUrls(uploadResult.publicId),
          },
        });
      } catch (uploadError: any) {
        res.status(500).json({
          success: false,
          error: uploadError.message,
        });
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Supprimer un fichier
app.delete('/api/v1/upload/:publicId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { publicId } = req.params;
    
    // Vérifier que le fichier appartient à l'utilisateur
    // (cette logique devrait être améliorée avec une table de suivi des uploads)
    if (!publicId.includes(req.user.id)) {
      res.status(403).json({
        success: false,
        error: 'Non autorisé à supprimer ce fichier',
      });
      return;
    }

    const deleted = await FileUploadService.deleteFile(publicId);
    
    if (deleted) {
      res.json({
        success: true,
        message: 'Fichier supprimé avec succès',
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Fichier non trouvé ou déjà supprimé',
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Obtenir les informations d'un fichier
app.get('/api/v1/upload/:publicId/info', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { publicId } = req.params;
    
    const fileInfo = await FileUploadService.getFileInfo(publicId);
    
    res.json({
      success: true,
      data: fileInfo,
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: 'Fichier non trouvé',
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
});

// ==================== NOTIFICATIONS ENDPOINTS ====================

// Get user notifications
app.get('/api/v1/notifications', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const {
      page = '1',
      limit = '10',
      type,
      read,
      search,
    } = req.query;

    const filters = {
      type: type as any,
      read: read === 'true' ? true : read === 'false' ? false : undefined,
      search: search as string,
    };

    const pagination = {
      page: parseInt(page as string),
      limit: Math.min(parseInt(limit as string), 50),
      sortBy: 'createdAt',
      sortOrder: 'desc' as 'desc',
    };

    const result = await NotificationsService.getUserNotifications(req.user.id, filters, pagination);

    res.json({
      success: true,
      data: result.notifications,
      meta: result.meta,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Mark notification as read
app.put('/api/v1/notifications/:notificationId/read', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { notificationId } = req.params;
    const notification = await NotificationsService.markAsRead(notificationId, req.user.id);

    res.json({
      success: true,
      message: 'Notification marquée comme lue',
      data: notification,
    });
  } catch (error: any) {
    if (error.message === 'Notification non trouvée') {
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

// Mark all notifications as read
app.put('/api/v1/notifications/read-all', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const result = await NotificationsService.markAllAsRead(req.user.id);

    res.json({
      success: true,
      message: `${result.count} notifications marquées comme lues`,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Delete notification
app.delete('/api/v1/notifications/:notificationId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { notificationId } = req.params;
    const result = await NotificationsService.deleteNotification(notificationId, req.user.id);

    res.json({
      success: true,
      message: 'Notification supprimée avec succès',
      data: result,
    });
  } catch (error: any) {
    if (error.message === 'Notification non trouvée') {
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

// Get unread notifications count
app.get('/api/v1/notifications/unread/count', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const result = await NotificationsService.getUnreadCount(req.user.id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ==================== ANALYTICS ENDPOINTS ====================

// Get platform statistics with rate limiting and validation
app.get('/api/v1/analytics/platform', 
  analyticsRateLimit,
  authenticateToken, 
  validatePermissions(['admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Utilisateur non authentifié',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const stats = await AnalyticsService.getPlatformStats();

      // Log analytics access for audit
      await AuditService.logResourceAction(
        AuditActions.ADMIN_ACTION,
        req.user.id,
        'ANALYTICS',
        'platform-stats',
        { action: 'view_platform_statistics' },
        req.ip,
        req.get('User-Agent')
      );

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get user activity metrics
app.get('/api/v1/analytics/user/:userId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { userId } = req.params;
    const { period = 'month' } = req.query;

    // Vérifier que l'utilisateur peut voir ces métriques (lui-même ou admin)
    const currentUser = await UsersService.getUserById(req.user.id);
    if (userId !== req.user.id && currentUser.profileType !== 'ADMIN') {
      res.status(403).json({
        success: false,
        error: 'Accès interdit - Vous ne pouvez voir que vos propres métriques',
      });
      return;
    }

    const metrics = await AnalyticsService.getUserActivityMetrics(
      userId, 
      period as 'week' | 'month' | 'year'
    );

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get my activity metrics
app.get('/api/v1/analytics/my-activity', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    const { period = 'month' } = req.query;

    const metrics = await AnalyticsService.getUserActivityMetrics(
      req.user.id, 
      period as 'week' | 'month' | 'year'
    );

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get engagement metrics
app.get('/api/v1/analytics/engagement', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    // Vérifier les permissions (admin seulement)
    const user = await UsersService.getUserById(req.user.id);
    if (user.profileType !== 'ADMIN') {
      res.status(403).json({
        success: false,
        error: 'Accès interdit - Admin requis',
      });
      return;
    }

    const metrics = await AnalyticsService.getEngagementMetrics();

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get time trends
app.get('/api/v1/analytics/trends', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    // Vérifier les permissions (admin seulement)
    const user = await UsersService.getUserById(req.user.id);
    if (user.profileType !== 'ADMIN') {
      res.status(403).json({
        success: false,
        error: 'Accès interdit - Admin requis',
      });
      return;
    }

    const { days = '30' } = req.query;
    const daysInt = Math.min(Math.max(parseInt(days as string), 1), 365);

    const trends = await AnalyticsService.getTimeTrends(daysInt);

    res.json({
      success: true,
      data: trends,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get usage statistics
app.get('/api/v1/analytics/usage', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Utilisateur non authentifié',
      });
      return;
    }

    // Vérifier les permissions (admin seulement)
    const user = await UsersService.getUserById(req.user.id);
    if (user.profileType !== 'ADMIN') {
      res.status(403).json({
        success: false,
        error: 'Accès interdit - Admin requis',
      });
      return;
    }

    const usage = await AnalyticsService.getUsageStatistics();

    res.json({
      success: true,
      data: usage,
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
      'POST /api/v1/messages': 'Send message',
      'GET /api/v1/messages/received': 'Get received messages',
      'GET /api/v1/messages/sent': 'Get sent messages',
      'GET /api/v1/messages/conversations': 'Get conversations',
      'GET /api/v1/messages/:id': 'Get message by ID',
      'PUT /api/v1/messages/:id/read': 'Mark as read',
      'DELETE /api/v1/messages/:id': 'Delete message',
      'GET /api/v1/messages/unread/count': 'Get unread count',
      'POST /api/v1/opportunities': 'Create opportunity',
      'GET /api/v1/opportunities': 'List opportunities',
      'GET /api/v1/opportunities/:id': 'Get opportunity by ID',
      'PUT /api/v1/opportunities/:id': 'Update opportunity',
      'DELETE /api/v1/opportunities/:id': 'Delete opportunity',
      'POST /api/v1/opportunities/:id/apply': 'Apply to opportunity',
      'GET /api/v1/opportunities/:id/applications': 'Get applications',
      'GET /api/v1/applications/my': 'Get my applications',
      'POST /api/v1/resources': 'Create resource',
      'GET /api/v1/resources': 'List resources',
      'GET /api/v1/resources/:id': 'Get resource by ID',
      'PUT /api/v1/resources/:id': 'Update resource',
      'DELETE /api/v1/resources/:id': 'Delete resource',
      'POST /api/v1/resources/:id/favorite': 'Toggle favorite',
      'GET /api/v1/resources/favorites/my': 'Get my favorites',
      'POST /api/v1/events': 'Create event',
      'GET /api/v1/events': 'List events',
      'GET /api/v1/events/:id': 'Get event by ID',
      'PUT /api/v1/events/:id': 'Update event',
      'DELETE /api/v1/events/:id': 'Delete event',
      'POST /api/v1/events/:id/register': 'Register for event',
      'DELETE /api/v1/events/:id/register': 'Unregister from event',
      'GET /api/v1/events/:id/registrations': 'Get event registrations',
      'GET /api/v1/events/registrations/my': 'Get my registrations',
      'GET /api/v1/notifications': 'Get user notifications',
      'PUT /api/v1/notifications/:id/read': 'Mark notification as read',
      'PUT /api/v1/notifications/read-all': 'Mark all as read',
      'DELETE /api/v1/notifications/:id': 'Delete notification',
      'GET /api/v1/notifications/unread/count': 'Get unread count',
      'POST /api/v1/upload/avatar': 'Upload user avatar',
      'POST /api/v1/upload/resource-thumbnail': 'Upload resource thumbnail',
      'POST /api/v1/upload/message-attachment': 'Upload message attachment',
      'POST /api/v1/upload/event-image': 'Upload event image',
      'DELETE /api/v1/upload/:publicId': 'Delete file',
      'GET /api/v1/upload/:publicId/info': 'Get file info',
      'GET /api/v1/analytics/platform': 'Get platform statistics (Admin)',
      'GET /api/v1/analytics/user/:userId': 'Get user activity metrics',
      'GET /api/v1/analytics/my-activity': 'Get my activity metrics',
      'GET /api/v1/analytics/engagement': 'Get engagement metrics (Admin)',
      'GET /api/v1/analytics/trends': 'Get time trends (Admin)',
      'GET /api/v1/analytics/usage': 'Get usage statistics (Admin)',
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

    const server = app.listen(PORT, () => {
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
      console.log('   POST /api/v1/messages');
      console.log('   GET  /api/v1/messages/received');
      console.log('   GET  /api/v1/messages/sent');
      console.log('   GET  /api/v1/messages/conversations');
      console.log('   GET  /api/v1/messages/:id');
      console.log('   PUT  /api/v1/messages/:id/read');
      console.log('   DEL  /api/v1/messages/:id');
      console.log('   GET  /api/v1/messages/unread/count');
      console.log('   POST /api/v1/opportunities');
      console.log('   GET  /api/v1/opportunities');
      console.log('   GET  /api/v1/opportunities/:id');
      console.log('   PUT  /api/v1/opportunities/:id');
      console.log('   DEL  /api/v1/opportunities/:id');
      console.log('   POST /api/v1/opportunities/:id/apply');
      console.log('   GET  /api/v1/opportunities/:id/applications');
      console.log('   GET  /api/v1/applications/my');
      console.log('   POST /api/v1/resources');
      console.log('   GET  /api/v1/resources');
      console.log('   GET  /api/v1/resources/:id');
      console.log('   PUT  /api/v1/resources/:id');
      console.log('   DEL  /api/v1/resources/:id');
      console.log('   POST /api/v1/resources/:id/favorite');
      console.log('   GET  /api/v1/resources/favorites/my');
      console.log('   POST /api/v1/events');
      console.log('   GET  /api/v1/events');
      console.log('   GET  /api/v1/events/:id');
      console.log('   PUT  /api/v1/events/:id');
      console.log('   DEL  /api/v1/events/:id');
      console.log('   POST /api/v1/events/:id/register');
      console.log('   DEL  /api/v1/events/:id/register');
      console.log('   GET  /api/v1/events/:id/registrations');
      console.log('   GET  /api/v1/events/registrations/my');
      console.log('   GET  /api/v1/notifications');
      console.log('   PUT  /api/v1/notifications/:id/read');
      console.log('   PUT  /api/v1/notifications/read-all');
      console.log('   DEL  /api/v1/notifications/:id');
      console.log('   GET  /api/v1/notifications/unread/count');
      console.log('   POST /api/v1/upload/avatar');
      console.log('   POST /api/v1/upload/resource-thumbnail');
      console.log('   POST /api/v1/upload/message-attachment');
      console.log('   POST /api/v1/upload/event-image');
      console.log('   DEL  /api/v1/upload/:publicId');
      console.log('   GET  /api/v1/upload/:publicId/info');
      console.log('   GET  /api/v1/analytics/platform');
      console.log('   GET  /api/v1/analytics/user/:userId');
      console.log('   GET  /api/v1/analytics/my-activity');
      console.log('   GET  /api/v1/analytics/engagement');
      console.log('   GET  /api/v1/analytics/trends');
      console.log('   GET  /api/v1/analytics/usage');
      console.log('===============================');
    });

    // Initialiser le service WebSocket
    const wsService = new WebSocketNotificationService(server);
    
    // Rendre le service WebSocket accessible globalement pour les notifications
    (global as any).wsService = wsService;
  } catch (error) {
    console.error('❌ Server start failed:', error);
    process.exit(1);
  }
}

startServer();