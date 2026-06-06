import { z } from 'zod';
import { SpecialtyEnum, ProviderStatus } from '@prisma/client';

const createSchema = z.object({
  childId: z.string({ error: 'childId is required' }),
  fullName: z.string({ error: 'fullName is required' }),
  specialty: z.enum(SpecialtyEnum, { error: 'specialty is required' }).optional(),
  phone: z.string({ error: 'phone is required' }).optional(),
  email: z.string({ error: 'email is required' }).optional(),
  address: z.string({ error: 'address is required' }).optional(),
  notes: z.string({ error: 'notes is required' }).optional(),
});

const updateSchema = z.object({
  childId: z.string({ error: 'childId is required' }).optional(),
  fullName: z.string({ error: 'fullName is required' }).optional(),
  specialty: z.enum(SpecialtyEnum, { error: 'specialty is required' }).optional(),
  phone: z.string({ error: 'phone is required' }).optional(),
  email: z.string({ error: 'email is required' }).optional(),
  address: z.string({ error: 'address is required' }).optional(),
  notes: z.string({ error: 'notes is required' }).optional(),
  status: z.enum(ProviderStatus, { error: 'status is required' }).optional(),
});

export const noteProviderValidation = {
  createSchema,
  updateSchema,
};