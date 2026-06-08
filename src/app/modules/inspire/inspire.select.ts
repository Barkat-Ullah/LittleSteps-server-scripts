import { Prisma } from '@prisma/client';

/**
 * ✏️  MANUALLY EDITABLE SELECT
 *
 * • Scalar fields  → set to `true` (included) or `false` / remove line (excluded)
 * • Relation fields → uncomment and customize the nested select as needed
 *
 * This file is generated ONCE. The generator will never overwrite it.
 */
export const inspireSelect = {
  id: true,
  text: true,
  date: true,
  status: true,
  type: true,
  createdAt: true,
} satisfies Prisma.InspireSelect;