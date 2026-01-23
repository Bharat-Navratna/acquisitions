import { db } from '#config/database.js';
import logger from '#config/logger.js';
import { users } from '#models/users.model.js';
import { eq } from 'drizzle-orm';

const userSelection = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  created_at: users.created_at,
  updated_at: users.updated_at,
};

export const getAllUsers = async () => {
  try {
    return await db.select(userSelection).from(users);
  } catch (e) {
    logger.error('Error fetching users:', e);
    throw e;
  }
};

export const getUserById = async id => {
  try {
    const [user] = await db
      .select(userSelection)
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user || null;
  } catch (e) {
    logger.error(`Error fetching user with id ${id}:`, e);
    throw e;
  }
};

export const updateUser = async (id, updates) => {
  try {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existing) {
      throw new Error('User not found');
    }

    const allowedUpdates = {};

    if (updates.name !== undefined) allowedUpdates.name = updates.name;
    if (updates.email !== undefined) allowedUpdates.email = updates.email;
    if (updates.role !== undefined) allowedUpdates.role = updates.role;

    // Always bump updated_at so we record the modification time
    allowedUpdates.updated_at = new Date();

    const [updatedUser] = await db
      .update(users)
      .set(allowedUpdates)
      .where(eq(users.id, id))
      .returning(userSelection);

    logger.info(`User with id ${id} updated successfully`);
    return updatedUser;
  } catch (e) {
    logger.error(`Error updating user with id ${id}:`, e);
    throw e;
  }
};

export const deleteUser = async id => {
  try {
    const [deletedUser] = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning(userSelection);

    if (!deletedUser) {
      throw new Error('User not found');
    }

    logger.info(`User with id ${id} deleted successfully`);
    return deletedUser;
  } catch (e) {
    logger.error(`Error deleting user with id ${id}:`, e);
    throw e;
  }
};
