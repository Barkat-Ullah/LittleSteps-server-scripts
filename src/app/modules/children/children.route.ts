import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { childrenController } from './children.controller';
import { childrenValidation } from './children.validation';
import { fileUploader } from '../../../utils/fileUploader';

const router = express.Router();
const fileUpload = fileUploader.upload.fields([
    { name: 'image', maxCount: 1 },
  ]);

router.post(
  '/',
  auth(),
  validateRequest(childrenValidation.createSchema),
  childrenController.createChildren,
);

router.get('/', auth(), childrenController.getChildrenList);
router.get('/my', auth(), childrenController.getMyChildren);
router.get('/:id', auth(), childrenController.getChildrenById);

router.put(
  '/:id',
  auth(),
  fileUpload,
  validateRequest(childrenValidation.updateSchema),
  childrenController.updateChildren,
);

router.patch(
  '/toggle-status/:id',
  auth(),
  childrenController.toggleStatusChildren,
);

router.delete(
  '/soft-delete/:id',
  auth(),
  childrenController.softDeleteChildren,
);

router.delete('/:id', auth(), childrenController.deleteChildren);

export const childrenRouter = router;