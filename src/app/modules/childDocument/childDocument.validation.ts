import { z } from 'zod';


const createSchema = z.object({
  childId: z.string({ error: 'childId is required' }),
  fileName: z.string({ error: 'fileName is required' }).optional(),
  image: z.string({ error: 'image is required' }).optional(),
  video: z.string({ error: 'video is required' }).optional(),
  pdf: z.string({ error: 'pdf is required' }).optional(),
  files: z.string({ error: 'files is required' }).optional(),
  uploadedAt: z.coerce.date({ error: 'uploadedAt is required' }).optional(),
});

const updateSchema = z.object({
  childId: z.string({ error: 'childId is required' }).optional(),
  fileName: z.string({ error: 'fileName is required' }).optional(),
  image: z.string({ error: 'image is required' }).optional(),
  video: z.string({ error: 'video is required' }).optional(),
  pdf: z.string({ error: 'pdf is required' }).optional(),
  files: z.string({ error: 'files is required' }).optional(),
  uploadedAt: z.coerce.date({ error: 'uploadedAt is required' }).optional(),
});

export const childDocumentValidation = {
  createSchema,
  updateSchema,
};