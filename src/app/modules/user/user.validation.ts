import { z } from "zod";
import { userRole } from "@prisma/client";

const objectIdSchema = z
  .string()
  .min(1, "id is required")
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid id format");

const commonQuerySchema = z.record(z.string(), z.string());

const userDetailsSchema = z
  .object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
  })
  .strict();

const createUserSchema = z.object({
  body: z
    .object({
      email: z.string().email(),
      password: z.string().min(6, "Password must be at least 6 characters"),
      role: z.nativeEnum(userRole).optional(),
      ...userDetailsSchema.shape,
    })
    .strict(),
  query: commonQuerySchema,
  params: z.record(z.string(), z.string()),
});

const getUserByIdSchema = z.object({
  body: z.any().optional(),
  query: commonQuerySchema,
  params: z.object({ id: objectIdSchema }).strict(),
});

const updateUserSchema = z.object({
  body: z
    .object({
      role: z.nativeEnum(userRole).optional(),
      ...userDetailsSchema.partial().shape,
    })
    .strict(),
  query: commonQuerySchema,
  params: z.object({ id: objectIdSchema }).strict(),
});

const updateMyProfileSchema = z.object({
  firstName: z.string().min(1, "First name cannot be empty").optional(),
  lastName: z.string().min(1, "Last name cannot be empty").optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  dob: z
    .string()
    .datetime({ message: "Invalid date format" })
    .optional()
    .or(z.string().nullable()),
  educationLevel: z.string().optional(),
  employmentStatus: z.string().optional(),
  parentingGoal: z.string().optional(),
  supportSystem: z.string().optional(),
  relation: z.string().optional(),
});

const updateUserRoleSchema = z.object({
  body: z
    .object({
      role: z.nativeEnum(userRole),
    })
    .strict(),
  query: commonQuerySchema,
  params: z.object({ id: objectIdSchema }).strict(),
});

const deleteUserSchema = z.object({
  body: z.any().optional(),
  query: commonQuerySchema,
  params: z.object({ id: objectIdSchema }).strict(),
});

const updateUserPasswordSchema = z.object({
  body: z
    .object({
      password: z.string().min(6, "Password must be at least 6 characters"),
    })
    .strict(),
  query: commonQuerySchema,
  params: z.object({ id: objectIdSchema }).strict(),
});

const updateUserEmailSchema = z.object({
  body: z
    .object({
      email: z.string().email(),
    })
    .strict(),
  query: commonQuerySchema,
  params: z.object({ id: objectIdSchema }).strict(),
});

export const userValidation = {
  objectIdSchema,
  createUserSchema,
  getUserByIdSchema,
  updateUserSchema,
  updateMyProfileSchema,
  updateUserRoleSchema,
  deleteUserSchema,
  updateUserPasswordSchema,
  updateUserEmailSchema,
};
