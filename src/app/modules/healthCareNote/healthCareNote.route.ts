import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { healthCareNoteController } from './healthCareNote.controller';
import { healthCareNoteValidation } from './healthCareNote.validation';
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
  validateRequest(healthCareNoteValidation.createSchema),
  healthCareNoteController.createHealthCareNote,
);

router.get('/', auth(), healthCareNoteController.getHealthCareNoteList);

router.get('/my/:childId', auth(), healthCareNoteController.getMyHealthCareNote);

router.get('/:id', auth(), healthCareNoteController.getHealthCareNoteById);

router.put(
  '/:id',
  auth(),
  fileUpload,
  validateRequest(healthCareNoteValidation.updateSchema),
  healthCareNoteController.updateHealthCareNote,
);

router.patch(
  '/toggle-status/:id',
  auth(),
  healthCareNoteController.toggleStatusHealthCareNote,
);

router.delete(
  '/soft-delete/:id',
  auth(),
  healthCareNoteController.softDeleteHealthCareNote,
);

router.delete('/:id', auth(), healthCareNoteController.deleteHealthCareNote);

export const healthCareNoteRouter = router;