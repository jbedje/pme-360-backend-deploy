import { Router } from 'express';
import { UsersController } from '../controllers/users';
import { authenticateToken, optionalAuth } from '../middleware/simple-auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting pour les actions sensibles
const userActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 actions par fenêtre
  message: {
    error: 'Trop d\'actions, veuillez réessayer plus tard',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==================== ROUTES PUBLIQUES ====================

/**
 * @route   GET /api/v1/users
 * @desc    Récupérer la liste des utilisateurs (publique avec pagination)
 * @access  Public (avec auth optionnelle pour plus d'infos)
 * @query   ?page=1&limit=10&profileType=STARTUP&location=Paris&verified=true&search=startup&sortBy=createdAt&sortOrder=desc
 */
router.get('/', optionalAuth, UsersController.getAllUsers);

/**
 * @route   GET /api/v1/users/:userId
 * @desc    Récupérer un utilisateur par son ID
 * @access  Public (avec auth optionnelle pour plus d'infos)
 */
router.get('/:userId', optionalAuth, UsersController.getUserById);

// ==================== ROUTES PROTÉGÉES ====================

/**
 * @route   GET /api/v1/users/me/profile
 * @desc    Récupérer le profil de l'utilisateur connecté
 * @access  Private
 */
router.get('/me/profile', authenticateToken, UsersController.getUserById);

/**
 * @route   PUT /api/v1/users/me
 * @desc    Mettre à jour le profil de l'utilisateur connecté
 * @access  Private
 * @body    { name?, company?, location?, description?, website?, linkedin?, phone? }
 */
router.put('/me', authenticateToken, userActionLimiter, UsersController.updateCurrentUser);

/**
 * @route   PUT /api/v1/users/:userId
 * @desc    Mettre à jour un utilisateur (seulement son propre profil)
 * @access  Private
 * @body    { name?, company?, location?, description?, website?, linkedin?, phone? }
 */
router.put('/:userId', authenticateToken, userActionLimiter, UsersController.updateUser);

/**
 * @route   DELETE /api/v1/users/me
 * @desc    Supprimer le compte de l'utilisateur connecté
 * @access  Private
 */
router.delete('/me', authenticateToken, userActionLimiter, UsersController.deleteCurrentUser);

// ==================== GESTION DES EXPERTISES ====================

/**
 * @route   POST /api/v1/users/me/expertises
 * @desc    Ajouter une expertise à l'utilisateur connecté
 * @access  Private
 * @body    { name: string, level: number (1-5) }
 */
router.post('/me/expertises', authenticateToken, userActionLimiter, UsersController.addExpertise);

/**
 * @route   DELETE /api/v1/users/me/expertises/:expertiseId
 * @desc    Supprimer une expertise de l'utilisateur connecté
 * @access  Private
 */
router.delete('/me/expertises/:expertiseId', authenticateToken, userActionLimiter, UsersController.removeExpertise);

export default router;