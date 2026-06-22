import httpStatus from "http-status";
import { Prisma, userRole, UserStatus } from "@prisma/client";
import { prisma } from "../../../shared/prisma";
import ApiError from "../../../error/ApiErrors";
import { IPaginationOptions } from "../../../interfaces/pagination";
import { paginationHelper } from "../../../shared/pagination";
import {
  cacheOr,
  CacheKeys,
  TTL,
  CacheInvalidator,
  invalidateKeys,
} from "../../../lib/redisConnection";
import { Request } from "express";
import { handleFileUploads } from "../../../utils/handleFile";

type IUserFilterRequest = {
  searchTerm?: string;
  status?: UserStatus;
};

const isUniqueConstraintError = (error: unknown) => {
  return Boolean((error as any)?.code === "P2002");
};

const getAllUsersFromDB = async (
  options: IPaginationOptions,
  filters: IUserFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm } = filters;

  const cacheKey = CacheKeys.list("user", { page, limit, searchTerm, ...filters });

  return cacheOr(cacheKey, TTL.SHORT, async () => {
    const where: Prisma.UserWhereInput = {
      role: userRole.USER,
      isDeleted: false,
    };

    if (searchTerm) {
      where.OR = [{ email: { contains: searchTerm, mode: "insensitive" } }];
    }

    if (filters.status) {
      where.status = filters.status;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          role: true,
          provider: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      meta: { total, page, limit },
      data: users,
    };
  });
};

const getUserDetailsFromDB = async (id: string) => {
  // Use same key pattern as auth middleware and existing invalidation
  return cacheOr(`user:${id}`, TTL.MEDIUM, async () => {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        provider: true,
        status: true,
        isDeleted: true,
        createdAt: true,
        userDetails: {
          select: {
            firstName: true,
            lastName: true,
            address: true,
            phone: true,
            files: true,
          },
        },
      },
    });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    return user;
  });
};

const getMyProfileFromDB = async (userId: string) => {
  // Use same key pattern as auth middleware for consistency
  return cacheOr(`user:${userId}`, TTL.MEDIUM, async () => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        provider: true,
        status: true,
        createdAt: true,
        userDetails: {
          select: {
            firstName: true,
            lastName: true,
            address: true,
            phone: true,
            files: true,
          },
        },
      },
    });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    return user;
  });
};

const updateMyProfileIntoDb = async (req: Request) => {
  const userId = req.user!.id;
  const data = req.body;
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const uploadedFiles = await handleFileUploads(files);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      `User not found with id: ${userId}`,
    );
  }

  const {
    firstName,
    lastName,
    address,
    phone,
    dob,
    educationLevel,
    employmentStatus,
    parentingGoal,
    supportSystem,
    relation,
  } = data;

  const userData: Prisma.UserUpdateInput = {};
  const userDetailsData: Record<string, any> = {};

  if (firstName !== undefined) userDetailsData.firstName = firstName;
  if (lastName !== undefined) userDetailsData.lastName = lastName;
  if (address !== undefined) userDetailsData.address = address;
  if (phone !== undefined) userDetailsData.phone = phone;

  if (dob !== undefined) userDetailsData.dob = dob ? new Date(dob) : null;
  if (educationLevel !== undefined)
    userDetailsData.educationLevel = educationLevel;
  if (employmentStatus !== undefined)
    userDetailsData.employmentStatus = employmentStatus;
  if (parentingGoal !== undefined)
    userDetailsData.parentingGoal = parentingGoal;
  if (supportSystem !== undefined)
    userDetailsData.supportSystem = supportSystem;
  if (relation !== undefined) userDetailsData.relation = relation;

  if (uploadedFiles) {
    userDetailsData.files = uploadedFiles;
  }

  const result = await prisma.user.update({
    where: { id: userId },
    data: {
      ...userData,
      userDetails: Object.keys(userDetailsData).length
        ? {
            upsert: {
              create: userDetailsData as any,
              update: userDetailsData,
            },
          }
        : undefined,
    },
    select: {
      id: true,
      email: true,
      role: true,
      provider: true,
      status: true,
      createdAt: true,
      userDetails: {
        select: {
          firstName: true,
          lastName: true,
          address: true,
          phone: true,
          files: true,
          dob: true,
        },
      },
    },
  });

  // Invalidate user cache after profile update
  await invalidateKeys(`user:${userId}`);
  await CacheInvalidator.onRelatedChange("user");

  return result;
};

const updateUserRoleIntoDb = async (id: string, role: userRole) => {
  if (!role) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Role is required");
  }

  try {
    const [updatedUser] = await Promise.all([
      prisma.user.update({
        where: { id },
        data: { role },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          userDetails: { select: { firstName: true, lastName: true } },
        },
      }),
      invalidateKeys(`user:${id}`),
    ]);

    return updatedUser;
  } catch (err: any) {
    // Prisma error code P2025 = record not found
    if (err?.code === "P2025") {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }
    throw err;
  }
};

const toggleUserStatus = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { status: true },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  const newStatus =
    user.status === UserStatus.ACTIVE
      ? UserStatus.SUSPENDED
      : UserStatus.ACTIVE;

  const [updatedUser] = await Promise.all([
    prisma.user.update({
      where: { id },
      data: { status: newStatus },
    }),
    invalidateKeys(`user:${id}`),
    CacheInvalidator.onRelatedChange("user"),
    prisma.userSession.deleteMany({ where: { userId: id } }),
  ]);

  return updatedUser;
};

const softDeleteUserById = async (id: string) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  const [updatedUser] = await Promise.all([
    // DB soft delete
    prisma.user.update({
      where: { id },
      data: { isDeleted: true },
      select: {
        id: true,
        email: true,
        isDeleted: true,
      },
    }),

    // ✅ Cache delete
    invalidateKeys(`user:${id}`),
    CacheInvalidator.onRelatedChange("user"),
    prisma.userSession.deleteMany({ where: { userId: id } }),
  ]);

  return updatedUser;
};

const updateUserIntoDb = async (payload: any, id: string) => {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid update payload");
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, `User not found with id: ${id}`);
  }

  const { firstName, lastName, address, phone } = payload;
  const userData: Prisma.UserUpdateInput = {};
  const userDetailsData: {
    firstName?: string | null;
    lastName?: string | null;
    address?: string | null;
    phone?: string | null;
  } = {};

  if (firstName !== undefined) {
    userDetailsData.firstName = firstName;
  }
  if (lastName !== undefined) {
    userDetailsData.lastName = lastName;
  }
  if (address !== undefined) {
    userDetailsData.address = address;
  }
  if (phone !== undefined) {
    userDetailsData.phone = phone;
  }

  const result = await prisma.user.update({
    where: { id },
    data: {
      ...userData,
      userDetails: Object.keys(userDetailsData).length
        ? {
            upsert: {
              create: userDetailsData,
              update: userDetailsData,
            },
          }
        : undefined,
    },
    select: {
      id: true,
      email: true,
      role: true,
      provider: true,
      createdAt: true,
      userDetails: {
        select: {
          firstName: true,
          lastName: true,
          address: true,
          phone: true,
          files: true,
        },
      },
    },
  });

  // Invalidate user cache after admin update
  await invalidateKeys(`user:${id}`);
  await CacheInvalidator.onRelatedChange("user");

  return result;
};

const deleteUserFromDB = async (id: string) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  await prisma.user.delete({ where: { id } });

  // Invalidate user cache after deletion
  await invalidateKeys(`user:${id}`);
  await CacheInvalidator.onRelatedChange("user");

  return { id };
};

export const UserServices = {
  getAllUsersFromDB,
  getMyProfileFromDB,
  getUserDetailsFromDB,
  updateMyProfileIntoDb,
  updateUserIntoDb,
  updateUserRoleIntoDb,
  toggleUserStatus,
  softDeleteUserById,
  deleteUserFromDB,
};