import { Prisma } from '@prisma/client';

export const contactSelect = {
  id: true,
  userId: true,
  name: true,
  email: true,
  subject: true,
  message: true,
  status: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
  // user: { select: { id: true, fullName: true, email: true } }, // ← uncomment to include
} satisfies Prisma.ContactSelect;