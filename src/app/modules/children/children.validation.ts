import { z } from 'zod';
import { PersonalizationType, LearningStage, ToiletingStatus } from '@prisma/client';

const createSchema = z.object({
  fullName: z.string({ error: 'fullName is required' }),
  dateOfBirth: z.coerce.date({ error: 'dateOfBirth is required' }),
  personalizationType: z.enum(PersonalizationType, { error: 'personalizationType is required' }).optional(),
  learningStage: z.enum(LearningStage, { error: 'learningStage is required' }).optional(),
  ageGroup: z.string({ error: 'ageGroup is required' }).optional(),
  supportReceived: z.array(z.string({ error: 'supportReceived is required' })),
  communication: z.array(z.string({ error: 'communication is required' })),
  toileting: z.enum(ToiletingStatus, { error: 'toileting is required' }).optional(),
  diagnoses: z.array(z.string({ error: 'diagnoses is required' })),
});

const updateSchema = z.object({
  fullName: z.string({ error: 'fullName is required' }).optional(),
  dateOfBirth: z.coerce.date({ error: 'dateOfBirth is required' }).optional(),
  personalizationType: z.enum(PersonalizationType, { error: 'personalizationType is required' }).optional(),
  learningStage: z.enum(LearningStage, { error: 'learningStage is required' }).optional(),
  ageGroup: z.string({ error: 'ageGroup is required' }).optional(),
  supportReceived: z.array(z.string({ error: 'supportReceived is required' })).optional(),
  communication: z.array(z.string({ error: 'communication is required' })).optional(),
  toileting: z.enum(ToiletingStatus, { error: 'toileting is required' }).optional(),
  diagnoses: z.array(z.string({ error: 'diagnoses is required' })).optional(),
});

export const childrenValidation = {
  createSchema,
  updateSchema,
};