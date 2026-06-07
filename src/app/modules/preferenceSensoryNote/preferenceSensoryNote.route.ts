import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { preferenceSensoryNoteController } from './preferenceSensoryNote.controller';
import { preferenceSensoryNoteValidation } from './preferenceSensoryNote.validation';
import { fileUploader } from '../../../utils/fileUploader';

const router = express.Router();
const fileUpload = fileUploader.upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'pdf', maxCount: 1 },
    { name: 'files', maxCount: 1 },
  ]);

router.post(
  '/',
  auth(),
  fileUpload,
  validateRequest(preferenceSensoryNoteValidation.createSchema),
  preferenceSensoryNoteController.createPreferenceSensoryNote,
);

router.get('/', auth(), preferenceSensoryNoteController.getPreferenceSensoryNoteList);

router.get('/my/:childId', auth(), preferenceSensoryNoteController.getMyPreferenceSensoryNote);

router.get('/:id', auth(), preferenceSensoryNoteController.getPreferenceSensoryNoteById);

router.put(
  '/:id',
  auth(),
  fileUpload,
  validateRequest(preferenceSensoryNoteValidation.updateSchema),
  preferenceSensoryNoteController.updatePreferenceSensoryNote,
);

router.patch(
  '/toggle-status/:id',
  auth(),
  preferenceSensoryNoteController.toggleStatusPreferenceSensoryNote,
);

router.delete(
  '/soft-delete/:id',
  auth(),
  preferenceSensoryNoteController.softDeletePreferenceSensoryNote,
);

router.delete('/:id', auth(), preferenceSensoryNoteController.deletePreferenceSensoryNote);

export const preferenceSensoryNoteRouter = router;