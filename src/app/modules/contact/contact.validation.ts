import { z } from 'zod';

const createSchema = z.object({
  name: z.string({ error: 'name is required' }),
  email: z.string({ error: 'email is required' }).email({ message: 'Invalid email address' }),
  subject: z.string({ error: 'subject is required' }),
  message: z.string({ error: 'message is required' }),
});

const updateSchema = z.object({
  name: z.string().optional(),
  email: z.string().email({ message: 'Invalid email address' }).optional(),
  subject: z.string().optional(),
  message: z.string().optional(),
});

export const contactValidation = {
  createSchema,
  updateSchema,
};