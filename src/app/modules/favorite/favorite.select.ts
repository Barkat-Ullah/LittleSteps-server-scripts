import { Prisma } from '@prisma/client';

/**
 * ✏️  MANUALLY EDITABLE SELECT
 *
 * • Scalar fields  → set to `true` (included) or `false` / remove line (excluded)
 * • Relation fields → uncomment and customize the nested select as needed
 *
 * This file is generated ONCE. The generator will never overwrite it.
 */
export const favoriteSelect = {
  id: true,
  userId: true,
  taskId: true,
  isFavorite: true,
  // task: { select: { id: true } }, // ← uncomment to include relation
  // user: { select: { id: true } }, // ← uncomment to include relation
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.favoriteSelect;