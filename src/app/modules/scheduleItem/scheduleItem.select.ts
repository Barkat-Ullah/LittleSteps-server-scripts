import { Prisma } from '@prisma/client';

/**
 * ✏️  MANUALLY EDITABLE SELECT
 *
 * • Scalar fields  → set to `true` (included) or `false` / remove line (excluded)
 * • Relation fields → uncomment and customize the nested select as needed
 *
 * This file is generated ONCE. The generator will never overwrite it.
 */
export const scheduleItemSelect = {
  id: true,
  userId: true,
  childIds: true,
  providerId: true,
  itemType: true,
  title: true,
  description: true,
  status: true,
  image: true,
  link: true,
  fileUrl: true,
  notes: true,
  startDate: true,
  endDate: true,
  startTime: true,
  endTime: true,
  duration: true,
  daysPWeek: true,
  days: true,
  isAddedCalender: true,
  isForAllChild: true,
  eventCategory: true,
  location: true,
  weeks: true,
  reminderTime: true,
  repeatType: true,
  repeatEndDate: true,
  stage: true,
  activityType: true,
  skill: true,
  materials: true,
  howToDoIt: true,
  whatItHelpsWith: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
  // user: { select: { id: true } }, // ← uncomment to include relation
  // children: { select: { id: true } }, // ← uncomment to include relation
  // provider: { select: { id: true } }, // ← uncomment to include relation
  // userCompletedActivities: { select: { id: true } }, // ← uncomment to include relation
} satisfies Prisma.ScheduleItemSelect;