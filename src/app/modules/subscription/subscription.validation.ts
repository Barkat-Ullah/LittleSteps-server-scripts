import { z } from "zod";
import { DurationType } from "@prisma/client";

const createSchema = z.object({
  title: z.string({ error: "title is required" }),
  description: z.string({ error: "description is required" }).optional(),
  amount: z.number({ error: "amount is required" }).int(),
  duration: z.enum(DurationType, { error: "duration is required" }),
  features: z.array(z.string({ error: "features is required" })),
});

const updateSchema = z.object({
  title: z.string({ error: "title is required" }).optional(),
  description: z.string({ error: "description is required" }).optional(),
  amount: z.number({ error: "amount is required" }).int().optional(),
  duration: z.enum(DurationType, { error: "duration is required" }).optional(),
  features: z.array(z.string({ error: "features is required" })).optional(),
});

export const subscriptionValidation = {
  createSchema,
  updateSchema,
};
