import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import compression from 'compression';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { config } from '../config';

// ==================== HELMET CONFIGURATION ====================

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'http:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'wss:', 'ws:'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Désactivé pour les uploads
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'same-origin' },
});

// ==================== RATE LIMITING ====================

// Rate limiter général
export const generalRateLimit = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS, // 15 minutes par défaut
  max: config.RATE_LIMIT_MAX_REQUESTS,   // 100 requêtes par défaut
  message: {
    success: false,
    error: 'Trop de requêtes, veuillez réessayer plus tard',
    retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 60000), // en minutes
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Utiliser l'IP et l'ID utilisateur si disponible
    const user = (req as any).user;
    return user ? `${req.ip}-${user.id}` : req.ip;
  },
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded:', {
      ip: req.ip,
      url: req.originalUrl,
      method: req.method,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });

    res.status(429).json({
      success: false,
      error: 'Trop de requêtes, veuillez réessayer plus tard',
      retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 60000),
      timestamp: new Date().toISOString(),
    });
  },
});

// Rate limiter strict pour l'authentification
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives par IP
  message: {
    success: false,
    error: 'Trop de tentatives de connexion, veuillez réessayer dans 15 minutes',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Ne pas compter les requêtes réussies
});

// Rate limiter pour les uploads
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 uploads par minute
  message: {
    success: false,
    error: 'Trop d\'uploads, veuillez attendre avant de réessayer',
    timestamp: new Date().toISOString(),
  },
});

// Rate limiter pour les messages
export const messageRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 messages par minute
  message: {
    success: false,
    error: 'Trop de messages envoyés, veuillez ralentir',
    timestamp: new Date().toISOString(),
  },
});

// Rate limiter pour les analytics (plus restrictif)
export const analyticsRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 requêtes analytics par 5 minutes
  message: {
    success: false,
    error: 'Trop de requêtes analytics, veuillez attendre',
    timestamp: new Date().toISOString(),
  },
});

// ==================== SLOW DOWN ====================

// Ralentir les requêtes progressivement
export const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // Après 50 requêtes, commencer à ralentir
  delayMs: 100, // Ajouter 100ms de délai par requête supplémentaire
  maxDelayMs: 20000, // Délai maximum de 20 secondes
});

// ==================== COMPRESSION ====================

export const compressionMiddleware = compression({
  filter: (req: Request, res: Response) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Niveau de compression (1-9)
  threshold: 1024, // Compresser seulement si > 1KB
});

// ==================== SECURITY MONITORING ====================

// Middleware de détection d'attaques
export const attackDetection = (req: Request, res: Response, next: NextFunction) => {
  const suspiciousPatterns = [
    // SQL Injection
    /(\%27)|(\')|(\")|(\%22)|(\-\-)|(\%3D)|(=).*(\%27)|(\').*(\;)|(\%3B)/i,
    // XSS
    /(<script[^>]*>.*?<\/script>)|(<iframe[^>]*>.*?<\/iframe>)|(<object[^>]*>.*?<\/object>)/i,
    // Path traversal
    /(\.\.|\.\/|\\\.\.)/i,
    // Command injection
    /(;|\||&|`|\$\(|\$\{)/i,
  ];

  const userAgent = req.get('User-Agent') || '';
  const url = req.originalUrl;
  const body = JSON.stringify(req.body);
  const query = JSON.stringify(req.query);

  const testString = `${url} ${body} ${query} ${userAgent}`;

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(testString)) {
      logger.warn('Suspicious request detected:', {
        ip: req.ip,
        userAgent,
        url,
        method: req.method,
        body: req.body,
        query: req.query,
        pattern: pattern.toString(),
        timestamp: new Date().toISOString(),
      });

      return res.status(400).json({
        success: false,
        error: 'Requête suspecte détectée',
        timestamp: new Date().toISOString(),
      });
    }
  }

  next();
};

// Middleware de détection de bots
export const botDetection = (req: Request, res: Response, next: NextFunction) => {
  const userAgent = req.get('User-Agent') || '';
  
  // Liste des bots malveillants connus
  const maliciousBots = [
    /sqlmap/i,
    /nikto/i,
    /masscan/i,
    /nmap/i,
    /zap/i,
    /burp/i,
    /acunetix/i,
    /nessus/i,
  ];

  for (const botPattern of maliciousBots) {
    if (botPattern.test(userAgent)) {
      logger.warn('Malicious bot detected:', {
        ip: req.ip,
        userAgent,
        url: req.originalUrl,
        timestamp: new Date().toISOString(),
      });

      return res.status(403).json({
        success: false,
        error: 'Accès interdit',
        timestamp: new Date().toISOString(),
      });
    }
  }

  next();
};

// ==================== IP WHITELIST/BLACKLIST ====================

// Liste noire d'IPs (en production, utiliser une base de données ou Redis)
const blacklistedIPs = new Set<string>();

export const ipBlacklist = (req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip;

  if (blacklistedIPs.has(clientIP)) {
    logger.warn('Blacklisted IP attempted access:', {
      ip: clientIP,
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });

    return res.status(403).json({
      success: false,
      error: 'Accès refusé',
      timestamp: new Date().toISOString(),
    });
  }

  next();
};

// Fonction pour ajouter une IP à la liste noire
export const addToBlacklist = (ip: string, reason?: string) => {
  blacklistedIPs.add(ip);
  logger.info(`IP added to blacklist: ${ip}`, { reason });
};

// Fonction pour retirer une IP de la liste noire
export const removeFromBlacklist = (ip: string) => {
  blacklistedIPs.delete(ip);
  logger.info(`IP removed from blacklist: ${ip}`);
};

// ==================== AUDIT MIDDLEWARE ====================

export const auditLog = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const user = (req as any).user;

  // Logger la requête
  const requestLog = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: user?.id,
    userEmail: user?.email,
    timestamp: new Date().toISOString(),
  };

  logger.info('Request received:', requestLog);

  // Intercepter la réponse
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed:', {
      ...requestLog,
      statusCode: res.statusCode,
      duration,
      responseSize: data ? data.length : 0,
    });

    return originalSend.call(this, data);
  };

  next();
};

// ==================== CORS PERSONNALISÉ ====================

export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // En développement, autoriser toutes les origines
    if (config.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // En production, utiliser la liste des origines autorisées
    const allowedOrigins = [config.FRONTEND_URL];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from origin:', origin);
      callback(new Error('Non autorisé par CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400, // 24 heures
};