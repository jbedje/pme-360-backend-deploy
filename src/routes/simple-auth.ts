import { Router } from 'express';
import { SimpleAuthController } from '../controllers/simple-auth';
import { authenticateToken, AuthenticatedRequest } from '../middleware/simple-auth';

const router = Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Inscription d'un nouvel utilisateur
 * @access  Public
 */
router.post('/register', SimpleAuthController.register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Connexion utilisateur
 * @access  Public
 */
router.post('/login', SimpleAuthController.login);

/**
 * @route   GET /api/v1/auth/profile
 * @desc    Récupérer le profil utilisateur actuel
 * @access  Private
 */
router.get('/profile', authenticateToken, SimpleAuthController.getProfile);

/**
 * @route   GET /api/v1/auth/test-protected
 * @desc    Route de test pour vérifier l'authentification
 * @access  Private
 */
router.get('/test-protected', authenticateToken, (req: AuthenticatedRequest, res) => {
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

export default router;