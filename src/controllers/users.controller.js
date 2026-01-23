import logger from '#config/logger.js';
import {
  getAllUsers,
  getUserById as getUserByIdService,
  updateUser as updateUserService,
  deleteUser as deleteUserService,
} from '#services/users.service.js';
import { formatValidationError } from '#utils/format.js';
import { updateUserSchema, userIdSchema } from '#validations/users.validation.js';

export const fetchAllUsers = async (req, res, next) => {
  try {
    logger.info('Fetching all users ...');

    const allUsers = await getAllUsers();

    res.json({
      message: 'Successfully fetched all users',
      users: allUsers,
      count: allUsers.length,
    });
  } catch (e) {
    logger.error(e);
    next(e);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const validationResult = userIdSchema.safeParse(req.params);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(validationResult.error),
      });
    }

    const { id } = validationResult.data;

    logger.info(`Fetching user with id ${id} ...`);

    const user = await getUserByIdService(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Successfully fetched user',
      user,
    });
  } catch (e) {
    logger.error('Error fetching user by id', e);
    next(e);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const authUser = req.user;

    if (!authUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const paramsResult = userIdSchema.safeParse(req.params);

    if (!paramsResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(paramsResult.error),
      });
    }

    const { id } = paramsResult.data;

    if (authUser.role !== 'admin' && authUser.id !== id) {
      return res
        .status(403)
        .json({ error: 'Forbidden', message: 'You can only update your own account' });
    }

    const bodyResult = updateUserSchema.safeParse(req.body);

    if (!bodyResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(bodyResult.error),
      });
    }

    const updates = bodyResult.data;

    if (updates.role && authUser.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can change user roles',
      });
    }

    logger.info(`Updating user with id ${id} ...`);

    const updatedUser = await updateUserService(id, updates);

    res.json({
      message: 'User updated successfully',
      user: updatedUser,
    });
  } catch (e) {
    logger.error('Error updating user', e);

    if (e.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }

    next(e);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const authUser = req.user;

    if (!authUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const paramsResult = userIdSchema.safeParse(req.params);

    if (!paramsResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationError(paramsResult.error),
      });
    }

    const { id } = paramsResult.data;

    if (authUser.role !== 'admin' && authUser.id !== id) {
      return res
        .status(403)
        .json({ error: 'Forbidden', message: 'You can only delete your own account' });
    }

    logger.info(`Deleting user with id ${id} ...`);

    await deleteUserService(id);

    res.json({ message: 'User deleted successfully' });
  } catch (e) {
    logger.error('Error deleting user', e);

    if (e.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }

    next(e);
  }
};
