import { z } from 'zod';


const createSchema = z.object({
  childId: z.string({ error: 'childId is required' }),
  title: z.string({ error: 'title is required' }),
  type: z.string({ error: 'type is required' }),
  description: z.string({ error: 'description is required' }),
});

const updateSchema = z.object({
  childId: z.string({ error: 'childId is required' }).optional(),
  title: z.string({ error: 'title is required' }).optional(),
  type: z.string({ error: 'type is required' }).optional(),
  description: z.string({ error: 'description is required' }).optional(),
});

export const lognoteValidation = {
  createSchema,
  updateSchema,
};