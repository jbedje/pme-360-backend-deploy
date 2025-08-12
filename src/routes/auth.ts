import { Router, Response } from 'express';
import { AuthController } from '../controllers/auth';
import { authenticateToken } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting pour les routes sensibles
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives par IP
  message: {
    error: 'Trop de tentatives de connexion, veuillez réessayer dans 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 3, // 3 demandes de réinitialisation par heure par IP
  message: {
    error: 'Trop de demandes de réinitialisation, veuillez réessayer dans 1 heure',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10, // 10 inscriptions par heure par IP
  message: {
    error: 'Trop d\'inscriptions, veuillez réessayer plus tard',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==================== ROUTES PUBLIQUES ====================

/**
 * @route   POST /api/v1/auth/register
 * @desc    Inscription d'un nouvel utilisateur
 * @access  Public
 * @body    { name, email, password, profileType, company?, location? }
 */
router.post('/register', registrationLimiter, AuthController.register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Connexion utilisateur
 * @access  Public
 * @body    { email, password }
 */
router.post('/login', authLimiter, AuthController.login);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Rafraîchir les tokens d'accès
 * @access  Public
 * @body    { refreshToken }
 */
router.post('/refresh', AuthController.refreshToken);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Demande de réinitialisation de mot de passe
 * @access  Public
 * @body    { email }
 */
router.post('/forgot-password', passwordResetLimiter, AuthController.requestPasswordReset);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Réinitialisation du mot de passe avec token
 * @access  Public
 * @body    { userId, resetToken, newPassword, confirmPassword }
 */
router.post('/reset-password', AuthController.resetPassword);

/**
 * @route   POST /api/v1/auth/verify-email
 * @desc    Vérification de l'adresse email
 * @access  Public
 * @body    { userId, verificationToken }
 */
router.post('/verify-email', AuthController.verifyEmail);

// ==================== ROUTES PROTÉGÉES ====================

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Déconnexion utilisateur (invalidation du refresh token)
 * @access  Private
 */
router.post('/logout', authenticateToken, AuthController.logout);

/**
 * @route   GET /api/v1/auth/profile
 * @desc    Récupérer le profil utilisateur actuel
 * @access  Private
 */
router.get('/profile', authenticateToken, AuthController.getProfile);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Changer le mot de passe (utilisateur connecté)
 * @access  Private
 * @body    { currentPassword, newPassword, confirmPassword }
 */
router.post('/change-password', authenticateToken, AuthController.changePassword);

/**
 * @route   POST /api/v1/auth/resend-verification
 * @desc    Renvoyer l'email de vérification
 * @access  Private
 */
router.post('/resend-verification', authenticateToken, AuthController.resendVerificationEmail);

// ==================== ROUTES DE TEST (À SUPPRIMER EN PRODUCTION) ====================

if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
  /**
   * @route   GET /api/v1/auth/test-protected
   * @desc    Route de test pour vérifier l'authentification
   * @access  Private
   */
  router.get('/test-protected', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
    res.json({
      success: true,
      message: 'Accès autorisé',
      user: req.user,
    });
  });

  /**
   * @route   GET /api/v1/auth/test-public
   * @desc    Route de test publique
   * @access  Public
   */
  router.get('/test-public', (req, res) => {
    res.json({
      success: true,
      message: 'Route publique accessible',
      timestamp: new Date().toISOString(),
    });
  });
}

export default router;