import { Prisma } from '@prisma/client';

/**
 * ✏️  MANUALLY EDITABLE SELECT
 *
 * • Scalar fields  → set to `true` (included) or `false` / remove line (excluded)
 * • Relation fields → uncomment and customize the nested select as needed
 *
 * This file is generated ONCE. The generator will never overwrite it.
 */
export const childDocumentSelect = {
  id: true,
  childId: true,
  fileName: true,
  image: true,
  video: true,
  pdf: true,
  files: true,
  uploadedAt: true,
  createdAt: true,
  updatedAt: true,
  // child: { select: { id: true } }, // ← uncomment to include relation
} satisfies Prisma.ChildDocumentSelect;