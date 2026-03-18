CREATE TABLE IF NOT EXISTS "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"username" text NOT NULL,
	"message" text NOT NULL,
	"chat_id" integer,
	"chat_type" text DEFAULT 'group' NOT NULL,
	"nonce" text,
	"sender_public_key" text,
	"recipient_id" integer,
	"date" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "private_chats" (
	"id" serial PRIMARY KEY NOT NULL,
	"user1_id" integer NOT NULL,
	"user2_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"role" integer DEFAULT 1 NOT NULL,
	"refresh_token" text,
	"public_key" text,
	"encrypted_private_key" text,
	"encrypted_private_key_iv" text,
	"encrypted_private_key_salt" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_login_unique" UNIQUE("login")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_chats" ADD CONSTRAINT "private_chats_user1_id_users_id_fk" FOREIGN KEY ("user1_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "private_chats" ADD CONSTRAINT "private_chats_user2_id_users_id_fk" FOREIGN KEY ("user2_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
