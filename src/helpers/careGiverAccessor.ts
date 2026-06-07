import { userRole } from "@prisma/client";
import ApiError from "../error/ApiErrors";
import prisma from "../shared/prisma";
import httpStatus from "http-status";

export async function getEffectiveAccessId(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      createdBy: {
        select: { id: true },
      },
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (user.role !== userRole.CAREGIVER) {
    return userId;
  }

  if (!user.createdBy?.id) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Caregiver has no associated parent/creator → no access to children',
    );
  }

  return user.createdBy.id;
}