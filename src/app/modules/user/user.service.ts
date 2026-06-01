import httpStatus from "http-status";
import { Prisma, userRole, UserStatus } from "@prisma/client";
import { prisma } from "../../../shared/prisma";
import ApiError from "../../../error/ApiErrors";
import { IPaginationOptions } from "../../../interfaces/pagination";
import { paginationHelper } from "../../../shared/pagination";
import redis from "../../../lib/redisConnection";
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
    meta: {
      total,
      page,
      limit,
    },
    data: users,
  };
};

const getUserDetailsFromDB = async (id: string) => {
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
};

const getMyProfileFromDB = async (userId: string) => {
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
};

const updateMyProfileIntoDb = async (req: Request) => {
  const userId = req.user!.id;
  const data = req.body; // রিকোয়েস্ট থেকে ডাটা নেওয়া হলো
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  // ১. ফাইল আপলোড হ্যান্ডেল করা
  const uploadedFiles = await handleFileUploads(files);

  // ২. ইউজার আদৌ ডাটাবেজে আছে কিনা চেক করা
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      `User not found with id: ${userId}`,
    );
  }

  // ৩. 'data' (payload নয়) থেকে ফিল্ডগুলো ডিস্ট্রাকচার করা
  const { firstName, lastName, address, phone, dob, educationLevel, employmentStatus, parentingGoal, supportSystem, relation } = data;
  
  const userData: Prisma.UserUpdateInput = {};
  const userDetailsData: Record<string, any> = {};

  // ৪. ডিফাইনড ভ্যালুগুলো অবজেক্টে পুশ করা
  if (firstName !== undefined) userDetailsData.firstName = firstName;
  if (lastName !== undefined) userDetailsData.lastName = lastName;
  if (address !== undefined) userDetailsData.address = address;
  if (phone !== undefined) userDetailsData.phone = phone;
  
  // অন্যান্য সম্ভাব্য ফিল্ড (অপশনাল, চাইলে রাখতে পারো)
  if (dob !== undefined) userDetailsData.dob = dob ? new Date(dob) : null;
  if (educationLevel !== undefined) userDetailsData.educationLevel = educationLevel;
  if (employmentStatus !== undefined) userDetailsData.employmentStatus = employmentStatus;
  if (parentingGoal !== undefined) userDetailsData.parentingGoal = parentingGoal;
  if (supportSystem !== undefined) userDetailsData.supportSystem = supportSystem;
  if (relation !== undefined) userDetailsData.relation = relation;

  // ৫. আপলোড করা ফাইলের স্ট্রিং/URL 'files' ফিল্ডে যুক্ত করা
  if (uploadedFiles) {
    userDetailsData.files = uploadedFiles; // handleFileUploads যেভাবে রিটার্ন করে (string বা array)
  }

  // 👑 ডাটাবেজ আপডেট অপারেশন
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
      redis.del(`user:${id}`),
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
    redis.del(`user:${id}`),
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
    redis.del(`user:${id}`),

    // ✅ Kill all active sessions
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

  const { role, firstName, lastName, address, phone } = payload;
  const userData: Prisma.UserUpdateInput = {};
  const userDetailsData: {
    firstName?: string | null;
    lastName?: string | null;
    address?: string | null;
    phone?: string | null;
  } = {};

  if (role !== undefined) {
    userData.role = role as userRole;
  }

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

  return result;
};

const deleteUserFromDB = async (id: string) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  await prisma.user.delete({ where: { id } });
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
