import { z } from "zod";

export const loginSchema = z.object({
  login: z.string().min(6).max(16).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(16),
});

export const registrationSchema = loginSchema.extend({
  username: z.string().trim().min(2).max(16),
});

export const messageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

export const usernameSchema = z.object({
  username: z.string().trim().min(2).max(16),
});

export const wsMessageSchema = z.object({
  type: z.literal("send_message"),
  accessToken: z.string().min(1),
  message: z.string().trim().min(1).max(10000),
  chatId: z.number().optional(),
  recipientId: z.number().optional(),
  replyToMessageId: z.number().int().positive().optional().nullable(),
  nonce: z.string().optional(),
  senderPublicKey: z.string().optional(),
  isEncrypted: z.number().optional(),
});

export const wsDeleteMessageSchema = z.object({
  type: z.literal("delete_message"),
  accessToken: z.string().min(1),
  id: z.number().int().positive(),
});

// Новый ивент для пагинации
export const wsLoadMoreMessagesSchema = z.object({
  type: z.literal("load_more_messages"),
  accessToken: z.string().min(1),
  chatId: z.number().optional().nullable(),
  chatType: z.enum(["group", "private"]).default("group"),
  lastMessageId: z.number().int().positive(),
});

export const validateData = <T>(schema: z.ZodSchema<T>, data: unknown): T | null => {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
};
