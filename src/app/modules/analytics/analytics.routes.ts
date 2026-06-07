import express from 'express';
import auth from '../../middlewares/auth';
import { userRole } from '@prisma/client';
import { analyticsController } from './analytics.controller';

const router = express.Router();

router.get(
  '/',
  auth(userRole.USER, userRole.CAREGIVER),
  analyticsController.getAnalyticsArticleByPeriodData,
);
router.get(
  '/:childId',
    auth(userRole.USER, userRole.CAREGIVER),
  analyticsController.getAnalyticsByPeriodData,
);

export const AnalyticsRoutes = router;
