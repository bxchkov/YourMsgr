import { z } from "zod";

export const loginSchema = z.object({
  login: z.string().min(6).max(16).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(16),
});

export const registrationSchema = loginSchema.extend({
  username: z.string().min(2).max(16),
});

export const messageSchema = z.object({
  message: z.string().min(1).max(2000),
});

export const validateData = <T>(schema: z.ZodSchema<T>, data: unknown): T | null => {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
};
