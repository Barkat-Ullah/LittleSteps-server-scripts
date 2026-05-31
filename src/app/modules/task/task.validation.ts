import { z } from 'zod';
import { Status } from '@prisma/client';

const createSchema = z.object({
  title: z.string({ error: 'title is required' }),
  description: z.string({ error: 'description is required' }).optional(),
  files: z.string({ error: 'files is required' }).optional(),
  status: z.enum(Status, { error: 'status is required' }).optional(),
  isDeleted: z.boolean({ error: 'isDeleted is required' }).optional(),
});

const updateSchema = z.object({
  title: z.string({ error: 'title is required' }).optional(),
  description: z.string({ error: 'description is required' }).optional(),
  files: z.string({ error: 'files is required' }).optional(),
  status: z.enum(Status, { error: 'status is required' }).optional(),
  isDeleted: z.boolean({ error: 'isDeleted is required' }).optional(),
});

export const taskValidation = {
  createSchema,
  updateSchema,
};