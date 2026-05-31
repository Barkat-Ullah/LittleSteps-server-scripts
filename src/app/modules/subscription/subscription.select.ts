import { Prisma } from '@prisma/client';

/**
 * ✏️  MANUALLY EDITABLE SELECT
 *
 * • Scalar fields  → set to `true` (included) or `false` / remove line (excluded)
 * • Relation fields → uncomment and customize the nested select as needed
 *
 * This file is generated ONCE. The generator will never overwrite it.
 */
export const subscriptionSelect = {
  id: true,
  title: true,
  description: true,
  amount: true,
  duration: true,
  features: true,
  stripeProductId: true,
  stripePriceId: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
  // userSubscription: { select: { id: true } }, // ← uncomment to include relation
  // payment: { select: { id: true } }, // ← uncomment to include relation
} satisfies Prisma.SubscriptionSelect;