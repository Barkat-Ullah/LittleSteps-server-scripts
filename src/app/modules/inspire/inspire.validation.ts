import { z } from 'zod';
import { EnumInspireStatus, EnumInspireType } from '@prisma/client';

const createSchema = z.object({
  text: z.string({ error: 'text is required' }),
  date: z.coerce.date({ error: 'date is required' }).optional(),
  type: z.enum(EnumInspireType, { error: 'type is required' }),
});

const updateSchema = z.object({
  text: z.string({ error: 'text is required' }).optional(),
  date: z.coerce.date({ error: 'date is required' }).optional(),
  type: z.enum(EnumInspireType, { error: 'type is required' }).optional(),
});

export const inspireValidation = {
  createSchema,
  updateSchema,
};