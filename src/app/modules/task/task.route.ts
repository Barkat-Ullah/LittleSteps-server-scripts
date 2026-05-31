import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { taskController } from './task.controller';
import { taskValidation } from './task.validation';
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
  fileUpload,
  auth(),
  validateRequest(taskValidation.createSchema),
  taskController.createTask,
);

router.get('/', auth(), taskController.getTaskList);

router.get('/my', auth(), taskController.getMyTask);

router.get('/:id', auth(), taskController.getTaskById);

router.put(
  '/:id',
  auth(),
  fileUpload,
  validateRequest(taskValidation.updateSchema),
  taskController.updateTask,
);

router.patch(
  '/toggle-status/:id',
  auth(),
  taskController.toggleStatusTask,
);

router.delete(
  '/soft-delete/:id',
  auth(),
  taskController.softDeleteTask,
);

router.delete('/:id', auth(), taskController.deleteTask);

export default router;