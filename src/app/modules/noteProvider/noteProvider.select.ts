import { Prisma } from '@prisma/client';

/**
 * ✏️  MANUALLY EDITABLE SELECT
 *
 * • Scalar fields  → set to `true` (included) or `false` / remove line (excluded)
 * • Relation fields → uncomment and customize the nested select as needed
 *
 * This file is generated ONCE. The generator will never overwrite it.
 */
export const noteProviderSelect = {
  id: true,
  childId: true,
  fullName: true,
  specialty: true,
  phone: true,
  email: true,
  address: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  // child: { select: { id: true } }, // ← uncomment to include relation
  // scheduleItems: { select: { id: true } }, // ← uncomment to include relation
} satisfies Prisma.NoteProviderSelect;