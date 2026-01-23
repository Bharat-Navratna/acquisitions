import express from 'express';
import {
  fetchAllUsers,
  getUserById,
  updateUser,
  deleteUser,
} from '#controllers/users.controller.js';
import authMiddleware from '#middleware/auth.middleware.js';

const router = express.Router();

// Protect all user routes with authentication middleware
router.use(authMiddleware);

router.get('/', fetchAllUsers);
router.get('/:id', getUserById);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
