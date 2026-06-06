import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { noteProviderController } from './noteProvider.controller';
import { noteProviderValidation } from './noteProvider.validation';
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
  validateRequest(noteProviderValidation.createSchema),
  noteProviderController.createNoteProvider,
);

router.get('/', auth(), noteProviderController.getNoteProviderList);

router.get('/my', auth(), noteProviderController.getMyNoteProvider);

router.get('/:id', auth(), noteProviderController.getNoteProviderById);

router.put(
  '/:id',
  auth(),
  fileUpload,
  validateRequest(noteProviderValidation.updateSchema),
  noteProviderController.updateNoteProvider,
);

router.patch(
  '/toggle-status/:id',
  auth(),
  noteProviderController.toggleStatusNoteProvider,
);

router.delete(
  '/soft-delete/:id',
  auth(),
  noteProviderController.softDeleteNoteProvider,
);

router.delete('/:id', auth(), noteProviderController.deleteNoteProvider);

export const noteProviderRouter = router;