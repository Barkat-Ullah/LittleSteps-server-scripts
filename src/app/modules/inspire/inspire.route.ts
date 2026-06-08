import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { inspireController } from './inspire.controller';
import { inspireValidation } from './inspire.validation';
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
  validateRequest(inspireValidation.createSchema),
  inspireController.createInspire,
);

router.get('/', auth(), inspireController.getInspireList);

router.get('/my', auth(), inspireController.getMyInspire);

router.get('/:id', auth(), inspireController.getInspireById);

router.put(
  '/:id',
  auth(),
  fileUpload,
  validateRequest(inspireValidation.updateSchema),
  inspireController.updateInspire,
);

router.patch(
  '/toggle-status/:id',
  auth(),
  inspireController.toggleStatusInspire,
);

router.delete(
  '/soft-delete/:id',
  auth(),
  inspireController.softDeleteInspire,
);

router.delete('/:id', auth(), inspireController.deleteInspire);

export const inspireRouter = router;