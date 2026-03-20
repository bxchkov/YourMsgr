import { z } from "zod";
import { isReservedIdentity } from "./identity";

const identityPattern = /^[a-zA-Z0-9_-]+$/;

const loginValueSchema = z
  .string()
  .trim()
  .refine((value) => identityPattern.test(value) && value.length >= 6 && value.length <= 16, {
    message: "Invalid login",
  })
  .refine((value) => !isReservedIdentity(value), {
    message: "Reserved login",
  });

const usernameValueSchema = z
  .string()
  .trim()
  .refine((value) => identityPattern.test(value) && value.length >= 6 && value.length <= 16, {
    message: "Invalid username",
  })
  .refine((value) => !isReservedIdentity(value), {
    message: "Reserved username",
  });

export const loginSchema = z.object({
  login: loginValueSchema,
  password: z.string().min(8).max(128),
});

export const registrationSchema = loginSchema.extend({
  username: usernameValueSchema,
  publicKey: z.string().min(1),
  encryptedPrivateKey: z.string().min(1),
  encryptedPrivateKeyIv: z.string().min(1),
  encryptedPrivateKeySalt: z.string().min(1),
});

export const messageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

export const usernameSchema = z.object({
  username: usernameValueSchema,
});

export const wsMessageSchema = z.object({
  type: z.literal("send_message"),
  accessToken: z.string().min(1).optional(),
  message: z.string().trim().min(1).max(2000),
  chatId: z.number().optional(),
  recipientId: z.number().optional(),
  replyToMessageId: z.number().int().positive().optional().nullable(),
  nonce: z.string().optional(),
  senderPublicKey: z.string().optional(),
  isEncrypted: z.number().optional(),
});

export const wsDeleteMessageSchema = z.object({
  type: z.literal("delete_message"),
  accessToken: z.string().min(1).optional(),
  id: z.number().int().positive(),
});

export const wsLoadMoreMessagesSchema = z.object({
  type: z.literal("load_more_messages"),
  accessToken: z.string().min(1).optional(),
  chatId: z.number().optional().nullable(),
  chatType: z.enum(["group", "private"]).default("group"),
  lastMessageId: z.number().int().positive(),
});

export const validateData = <T>(schema: z.ZodSchema<T>, data: unknown): T | null => {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
};
