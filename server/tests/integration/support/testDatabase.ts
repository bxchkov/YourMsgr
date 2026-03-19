import { createDatabase, type Database, type DatabaseClient } from "../../../src/db";
import postgres from "postgres";

const TEST_TABLES_SQL = `
CREATE TABLE users (
  id serial PRIMARY KEY,
  login text NOT NULL UNIQUE,
  username text NOT NULL,
  password text NOT NULL,
  role integer NOT NULL DEFAULT 1,
  refresh_token text,
  public_key text,
  encrypted_private_key text,
  encrypted_private_key_iv text,
  encrypted_private_key_salt text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE private_chats (
  id serial PRIMARY KEY,
  user1_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user2_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT private_chats_user1_id_user2_id_unique UNIQUE (user1_id, user2_id)
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
  date timestamp NOT NULL DEFAULT now()
);
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
