DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" in (1, 3));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_chats" ADD CONSTRAINT "private_chats_distinct_users_check" CHECK ("user1_id" <> "user2_id");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "private_chats_user1_id_idx" ON "private_chats" ("user1_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "private_chats_user2_id_idx" ON "private_chats" ("user2_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_type_check" CHECK ("chat_type" in ('group', 'private'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_is_encrypted_check" CHECK ("is_encrypted" in (0, 1));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_user_id_idx" ON "messages" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_reply_to_message_id_idx" ON "messages" ("reply_to_message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_chat_type_id_idx" ON "messages" ("chat_type", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_chat_id_id_idx" ON "messages" ("chat_id", "id");
