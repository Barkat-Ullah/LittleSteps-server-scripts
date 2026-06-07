import { z } from 'zod';
import { SensoryCategoryEnum } from '@prisma/client';

const createSchema = z.object({
  childId: z.string({ error: 'childId is required' }),
  title: z.string({ error: 'title is required' }),
  description: z.string({ error: 'description is required' }).optional(),
  helps: z.string({ error: 'helps is required' }).optional(),
  avoid: z.string({ error: 'avoid is required' }).optional(),
  category: z.enum(SensoryCategoryEnum, { error: 'category is required' }).optional(),
});

const updateSchema = z.object({
  title: z.string({ error: 'title is required' }).optional(),
  description: z.string({ error: 'description is required' }).optional(),
  helps: z.string({ error: 'helps is required' }).optional(),
  avoid: z.string({ error: 'avoid is required' }).optional(),
  category: z.enum(SensoryCategoryEnum, { error: 'category is required' }).optional(),
});

export const preferenceSensoryNoteValidation = {
  createSchema,
  updateSchema,
};