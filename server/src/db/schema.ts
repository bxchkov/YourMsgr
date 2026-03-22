import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp, unique, type AnyPgColumn } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  login: text("login").notNull().unique(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  role: integer("role").notNull().default(1),
  refreshToken: text("refresh_token"),
  publicKey: text("public_key"),
  encryptedPrivateKey: text("encrypted_private_key"),
  encryptedPrivateKeyIv: text("encrypted_private_key_iv"),
  encryptedPrivateKeySalt: text("encrypted_private_key_salt"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  usernameUnique: unique("users_username_unique").on(table.username),
  roleCheck: check("users_role_check", sql`${table.role} in (1, 3)`),
}));

export const privateChats = pgTable("private_chats", {
  id: serial("id").primaryKey(),
  user1Id: integer("user1_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  user2Id: integer("user2_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueChat: unique("private_chats_user1_id_user2_id_unique").on(table.user1Id, table.user2Id),
  user1Idx: index("private_chats_user1_id_idx").on(table.user1Id),
  user2Idx: index("private_chats_user2_id_idx").on(table.user2Id),
  userOrderCheck: check("private_chats_user_order_check", sql`${table.user1Id} < ${table.user2Id}`),
}));

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  message: text("message").notNull(), // encrypted message blob or plain text
  chatId: integer("chat_id").references(() => privateChats.id, { onDelete: "cascade" }), // null = general chat, otherwise private_chats.id
  chatType: text("chat_type").notNull().default("group"), // "group" or "private"
  nonce: text("nonce"), // encryption nonce for E2EE
  senderPublicKey: text("sender_public_key"), // sender's public key for decryption
  replyToMessageId: integer("reply_to_message_id").references((): AnyPgColumn => messages.id, { onDelete: "set null" }),
  recipientId: integer("recipient_id").references(() => users.id, { onDelete: "cascade" }), // for private chats
  isEncrypted: integer("is_encrypted").notNull().default(0), // 0 = plain text, 1 = E2EE encrypted
  date: timestamp("date").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("messages_user_id_idx").on(table.userId),
  replyTargetIdx: index("messages_reply_to_message_id_idx").on(table.replyToMessageId),
  groupHistoryIdx: index("messages_chat_type_id_idx").on(table.chatType, table.id),
  privateHistoryIdx: index("messages_chat_id_id_idx").on(table.chatId, table.id),
  privatePreviewIdx: index("messages_chat_id_date_id_idx").on(table.chatId, table.date, table.id),
  chatTypeCheck: check("messages_chat_type_check", sql`${table.chatType} in ('group', 'private')`),
  encryptionFlagCheck: check("messages_is_encrypted_check", sql`${table.isEncrypted} in (0, 1)`),
  chatConsistencyCheck: check(
    "messages_chat_consistency_check",
    sql`(
      (${table.chatType} = 'group' and ${table.chatId} is null and ${table.recipientId} is null)
      or
      (${table.chatType} = 'private' and ${table.chatId} is not null and ${table.recipientId} is not null)
    )`,
  ),
}));
