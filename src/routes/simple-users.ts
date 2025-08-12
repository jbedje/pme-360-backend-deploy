import { Router } from 'express';
import { SimpleUsersController } from '../controllers/simple-users';
import { authenticateToken, optionalAuth } from '../middleware/simple-auth';

const router = Router();

/**
 * @route   GET /api/v1/users
 * @desc    Récupérer la liste des utilisateurs
 * @access  Public
 */
router.get('/', SimpleUsersController.getAllUsers);

/**
 * @route   GET /api/v1/users/:userId
 * @desc    Récupérer un utilisateur par son ID
 * @access  Public
 */
router.get('/:userId', SimpleUsersController.getUserById);

/**
 * @route   PUT /api/v1/users/me
 * @desc    Mettre à jour le profil de l'utilisateur connecté
 * @access  Private
 */
router.put('/me', authenticateToken, SimpleUsersController.updateCurrentUser);

/**
 * @route   POST /api/v1/users/me/expertises
 * @desc    Ajouter une expertise à l'utilisateur connecté
 * @access  Private
 */
router.post('/me/expertises', authenticateToken, SimpleUsersController.addExpertise);

export default router;