import { Prisma } from '@prisma/client';

/**
 * ✏️  MANUALLY EDITABLE SELECT
 *
 * • Scalar fields  → set to `true` (included) or `false` / remove line (excluded)
 * • Relation fields → uncomment and customize the nested select as needed
 *
 * This file is generated ONCE. The generator will never overwrite it.
 */
export const taskSelect = {
  id: true,
  userId: true,
  title: true,
  description: true,
  files: true,
  status: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
  // user: { select: { id: true } }, // ← uncomment to include relation
} satisfies Prisma.TaskSelect;