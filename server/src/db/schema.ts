import { pgTable, serial, text, timestamp, integer, unique, type AnyPgColumn } from "drizzle-orm/pg-core";

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
});

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
  uniqueChat: unique().on(table.user1Id, table.user2Id),
}));

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  message: text("message").notNull(), // encrypted message blob or plain text
  chatId: integer("chat_id"), // null = general chat, otherwise private_chats.id
  chatType: text("chat_type").notNull().default("group"), // "group" or "private"
  nonce: text("nonce"), // encryption nonce for E2EE
  senderPublicKey: text("sender_public_key"), // sender's public key for decryption
  replyToMessageId: integer("reply_to_message_id").references((): AnyPgColumn => messages.id, { onDelete: "set null" }),
  recipientId: integer("recipient_id").references(() => users.id, { onDelete: "cascade" }), // для личных чатов
  isEncrypted: integer("is_encrypted").notNull().default(0), // 0 = plain text, 1 = E2EE encrypted
  date: timestamp("date").defaultNow().notNull(),
});
