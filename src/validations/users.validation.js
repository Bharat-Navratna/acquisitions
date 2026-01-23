import { z } from 'zod';

export const userIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(255).trim().optional(),
  email: z.email().max(255).toLowerCase().trim().optional(),
  role: z.enum(['user', 'admin']).optional(),
});
