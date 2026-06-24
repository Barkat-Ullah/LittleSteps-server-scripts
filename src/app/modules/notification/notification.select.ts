import { Prisma } from '@prisma/client';

/**
 * ✏️  MANUALLY EDITABLE SELECT
 *
 * • Scalar fields  → set to `true` (included) or `false` / remove line (excluded)
 * • Relation fields → uncomment and customize the nested select as needed
 *
 * This file is generated ONCE. The generator will never overwrite it.
 */
export const notificationSelect = {
  id: true,
  receiverId: true,
  senderId: true,
  title: true,
  body: true,
  isRead: true,
  referenceId: true,
  type: true,
  createdAt: true,
  updatedAt: true,
  // receiver: { select: { id: true } }, // ← uncomment to include relation
  // sender: { select: { id: true } }, // ← uncomment to include relation
} satisfies Prisma.NotificationSelect;