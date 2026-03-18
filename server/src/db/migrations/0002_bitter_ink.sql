ALTER TABLE "messages" ADD COLUMN "reply_to_message_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_messages_id_fk" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "private_chats" ADD CONSTRAINT "private_chats_user1_id_user2_id_unique" UNIQUE("user1_id","user2_id");