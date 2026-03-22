ALTER TABLE "private_chats" DROP CONSTRAINT IF EXISTS "private_chats_user_order_check";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_chats" ADD CONSTRAINT "private_chats_distinct_users_check" CHECK ("user1_id" <> "user2_id");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_chat_consistency_check";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_chat_id_private_chats_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "messages_chat_id_date_id_idx";
