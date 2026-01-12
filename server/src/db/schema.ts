import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  login: text("login").notNull().unique(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  role: integer("role").notNull().default(1),
  refreshToken: text("refresh_token"),
  publicKey: text("public_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  message: text("message").notNull(),
  date: timestamp("date").defaultNow().notNull(),
});
