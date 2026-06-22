import { userRole } from "@prisma/client";
import ApiError from "../error/ApiErrors";
import httpStatus from "http-status";

export function getEffectiveAccessId(user: {
  id: string;
  role: string;
  createdById?: string | null;
}): string {
  if (user.role !== userRole.CAREGIVER) {
    return user.id;
  }

  if (!user.createdById) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Caregiver has no associated parent/creator → no access to children",
    );
  }

  return user.createdById;
}