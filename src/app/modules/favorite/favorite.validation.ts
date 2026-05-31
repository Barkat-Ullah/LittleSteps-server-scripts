import { z } from "zod";

// ✅ taskId params এ আছে — body validation empty
const createSchema = z.object({
  params: z.object({
    taskId: z.string({ message: "taskId is required" }).min(1),
  }),
  body: z.object({}).optional(),
});

const filterSchema = z.object({
  query: z.object({
    searchTerm: z.string().optional(),
    id: z.string().optional(),
    createdAt: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
});

export const favoriteValidation = {
  createSchema,
  filterSchema,
};