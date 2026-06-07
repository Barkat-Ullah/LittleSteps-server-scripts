import { z } from 'zod';
import { NoteType } from '@prisma/client';

const createSchema = z.object({
  childId: z.string({ error: 'childId is required' }),
  title: z.string({ error: 'title is required' }),
  description: z.string({ error: 'description is required' }).optional(),
  note: z.enum(NoteType, { error: 'note is required' }).optional(),
});

const updateSchema = z.object({
  title: z.string({ error: 'title is required' }).optional(),
  description: z.string({ error: 'description is required' }).optional(),
  note: z.enum(NoteType, { error: 'note is required' }).optional(),
});

export const healthCareNoteValidation = {
  createSchema,
  updateSchema,
};