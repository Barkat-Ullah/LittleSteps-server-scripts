import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { scheduleItemController } from './scheduleItem.controller';
import { scheduleItemValidation } from './scheduleItem.validation';
import { fileUploader } from '../../../utils/fileUploader';

const router = express.Router();

const fileUpload = fileUploader.upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'pdf', maxCount: 1 },
  { name: 'files', maxCount: 1 },
]);

// ── Create ─────────────────────────────────────────────────────────────────
router.post(
  '/',
  auth(),
  fileUpload,
  validateRequest(scheduleItemValidation.createSchema),
  scheduleItemController.createScheduleItem,
);

// ── List / query ───────────────────────────────────────────────────────────

// Global list (admin)
router.get('/', auth(), scheduleItemController.getScheduleItemList);

// User's management list (no date filter)
router.get('/my', auth(), scheduleItemController.getMyScheduleItem);

// Unified day view — ?date=YYYY-MM-DD&childId=...&itemType=Event|Activity
router.get('/by-date', auth(), scheduleItemController.getScheduleItemListByDate);

// Monthly calendar dots — ?month=YYYY-MM
router.get('/monthly', auth(), scheduleItemController.getMonthlyScheduleItems);

// ── Single record ──────────────────────────────────────────────────────────
router.get('/:id', auth(), scheduleItemController.getScheduleItemById);

// ── Mutations ──────────────────────────────────────────────────────────────
router.put(
  '/:id',
  auth(),
  fileUpload,
  validateRequest(scheduleItemValidation.updateSchema),
  scheduleItemController.updateScheduleItem,
);

router.patch(
  '/toggle-status/:id',
  auth(),
  scheduleItemController.toggleStatusScheduleItem,
);

router.delete(
  '/soft-delete/:id',
  auth(),
  scheduleItemController.softDeleteScheduleItem,
);

router.delete('/:id', auth(), scheduleItemController.deleteScheduleItem);

export const scheduleItemRouter = router;