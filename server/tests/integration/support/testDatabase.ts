import { createDatabase, type Database, type DatabaseClient } from "../../../src/db";
import postgres from "postgres";

const TEST_TABLES_SQL = `
CREATE TABLE users (
  id serial PRIMARY KEY,
  login text NOT NULL UNIQUE,
  username text NOT NULL UNIQUE,
  password text NOT NULL,
  role integer NOT NULL DEFAULT 1,
  refresh_token text,
  public_key text,
  encrypted_private_key text,
  encrypted_private_key_iv text,
  encrypted_private_key_salt text,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT users_role_check CHECK (role in (1, 3))
);

CREATE TABLE private_chats (
  id serial PRIMARY KEY,
  user1_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT private_chats_user1_id_user2_id_unique UNIQUE (user1_id, user2_id),
  CONSTRAINT private_chats_user_order_check CHECK (user1_id < user2_id)
);

CREATE TABLE messages (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username text NOT NULL,
  message text NOT NULL,
  chat_id integer REFERENCES private_chats(id) ON DELETE CASCADE,
  chat_type text NOT NULL DEFAULT 'group',
  nonce text,
  sender_public_key text,
  reply_to_message_id integer REFERENCES messages(id) ON DELETE SET NULL,
  recipient_id integer REFERENCES users(id) ON DELETE CASCADE,
  is_encrypted integer NOT NULL DEFAULT 0,
  date timestamp NOT NULL DEFAULT now(),
  CONSTRAINT messages_chat_type_check CHECK (chat_type in ('group', 'private')),
  CONSTRAINT messages_is_encrypted_check CHECK (is_encrypted in (0, 1)),
  CONSTRAINT messages_chat_consistency_check CHECK (
    (
      chat_type = 'group'
      AND chat_id IS NULL
      AND recipient_id IS NULL
    )
    OR
    (
      chat_type = 'private'
      AND chat_id IS NOT NULL
      AND recipient_id IS NOT NULL
    )
  )
);

CREATE INDEX private_chats_user1_id_idx ON private_chats (user1_id);
CREATE INDEX private_chats_user2_id_idx ON private_chats (user2_id);
CREATE INDEX messages_user_id_idx ON messages (user_id);
CREATE INDEX messages_reply_to_message_id_idx ON messages (reply_to_message_id);
CREATE INDEX messages_chat_type_id_idx ON messages (chat_type, id DESC);
CREATE INDEX messages_chat_id_id_idx ON messages (chat_id, id DESC);
CREATE INDEX messages_chat_id_date_id_idx ON messages (chat_id, date DESC, id DESC);
`;

export interface TestDatabaseContext {
  db: Database;
  client: DatabaseClient;
  schemaName: string;
  reset: () => Promise<void>;
  cleanup: () => Promise<void>;
}

const buildSchemaName = () => {
  return `it_${crypto.randomUUID().replaceAll("-", "_")}`;
};

const getConnectionString = () => {
  const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for integration tests");
  }

  return connectionString;
};

export const createTestDatabase = async (): Promise<TestDatabaseContext> => {
  const schemaName = buildSchemaName();
  const client = postgres(getConnectionString(), {
    max: 1,
    onnotice: () => undefined,
  });

  await client.unsafe(`create schema "${schemaName}"`);
  await client.unsafe(`set search_path to "${schemaName}"`);
  await client.unsafe(TEST_TABLES_SQL);

  const db = createDatabase(client);

  const reset = async () => {
    await client.unsafe("truncate table messages, private_chats, users restart identity cascade");
  };

  const cleanup = async () => {
    try {
      await client.unsafe(`drop schema if exists "${schemaName}" cascade`);
    } finally {
      await client.end();
    }
  };

  return {
    db,
    client,
    schemaName,
    reset,
    cleanup,
  };
};
