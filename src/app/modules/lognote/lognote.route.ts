import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { lognoteController } from './lognote.controller';
import { lognoteValidation } from './lognote.validation';
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
  validateRequest(lognoteValidation.createSchema),
  lognoteController.createLognote,
);

router.get('/', auth(), lognoteController.getLognoteList);

router.get('/my/:childId', auth(), lognoteController.getMyLognote);

router.get('/:id', auth(), lognoteController.getLognoteById);

router.put(
  '/:id',
  auth(),
  fileUpload,
  validateRequest(lognoteValidation.updateSchema),
  lognoteController.updateLognote,
);

router.patch(
  '/toggle-status/:id',
  auth(),
  lognoteController.toggleStatusLognote,
);

router.delete(
  '/soft-delete/:id',
  auth(),
  lognoteController.softDeleteLognote,
);

router.delete('/:id', auth(), lognoteController.deleteLognote);

export const lognoteRouter = router;