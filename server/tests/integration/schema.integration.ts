import { describe, expect, test } from "bun:test";
import { useTestRuntime } from "./support/testServer";

const getRuntime = useTestRuntime();

describe("Database integration: schema guards and indexes", () => {
  test("enforces unique usernames at database level", async () => {
    const { client } = getRuntime();

    await client.unsafe(`
      insert into users (
        login,
        username,
        password,
        role,
        public_key,
        encrypted_private_key,
        encrypted_private_key_iv,
        encrypted_private_key_salt
      ) values (
        'schemauser1',
        'SchemaUser',
        'hashed-password',
        1,
        'public-key-1',
        'enc-key-1',
        'iv-1',
        'salt-1'
      )
    `);

    await expect(
      client.unsafe(`
        insert into users (
          login,
          username,
          password,
          role,
          public_key,
          encrypted_private_key,
          encrypted_private_key_iv,
          encrypted_private_key_salt
        ) values (
          'schemauser2',
          'SchemaUser',
          'hashed-password',
          1,
          'public-key-2',
          'enc-key-2',
          'iv-2',
          'salt-2'
        )
      `)
    ).rejects.toThrow();
  });

  test("enforces basic check constraints at database level", async () => {
    const { client } = getRuntime();

    await expect(
      client.unsafe(`
        insert into users (
          login,
          username,
          password,
          role,
          public_key,
          encrypted_private_key,
          encrypted_private_key_iv,
          encrypted_private_key_salt
        ) values (
          'invalidrole',
          'InvalidRole',
          'hashed-password',
          99,
          'public-key',
          'enc-key',
          'iv',
          'salt'
        )
      `)
    ).rejects.toThrow();

    await client.unsafe(`
      insert into users (
        login,
        username,
        password,
        role,
        public_key,
        encrypted_private_key,
        encrypted_private_key_iv,
        encrypted_private_key_salt
      ) values (
        'validuser',
        'ValidUser',
        'hashed-password',
        1,
        'public-key',
        'enc-key',
        'iv',
        'salt'
      )
    `);

    await client.unsafe(`
      insert into users (
        login,
        username,
        password,
        role,
        public_key,
        encrypted_private_key,
        encrypted_private_key_iv,
        encrypted_private_key_salt
      ) values (
        'othervalid',
        'OtherValid',
        'hashed-password',
        1,
        'public-key-2',
        'enc-key-2',
        'iv-2',
        'salt-2'
      )
    `);

    await expect(
      client.unsafe(`
        insert into private_chats (user1_id, user2_id)
        values (1, 1)
      `)
    ).rejects.toThrow();

    await expect(
      client.unsafe(`
        insert into messages (user_id, username, message, chat_type, is_encrypted)
        values (1, 'ValidUser', 'Bad type', 'broadcast', 0)
      `)
    ).rejects.toThrow();

    await expect(
      client.unsafe(`
        insert into messages (user_id, username, message, chat_type, is_encrypted)
        values (1, 'ValidUser', 'Bad flag', 'group', 5)
      `)
    ).rejects.toThrow();

    await expect(
      client.unsafe(`
        insert into private_chats (user1_id, user2_id)
        values (2, 1)
      `)
    ).rejects.toThrow();

    await expect(
      client.unsafe(`
        insert into messages (user_id, username, message, chat_type, recipient_id, is_encrypted)
        values (1, 'ValidUser', 'Broken group', 'group', 2, 0)
      `)
    ).rejects.toThrow();

    await expect(
      client.unsafe(`
        insert into messages (user_id, username, message, chat_type, chat_id, recipient_id, is_encrypted)
        values (1, 'ValidUser', 'Broken private', 'private', null, 2, 0)
      `)
    ).rejects.toThrow();

    await expect(
      client.unsafe(`
        insert into messages (user_id, username, message, chat_type, chat_id, recipient_id, is_encrypted)
        values (1, 'ValidUser', 'Broken private fk', 'private', 999, 2, 0)
      `)
    ).rejects.toThrow();
  });

  test("creates expected performance indexes", async () => {
    const { client, schemaName } = getRuntime();

    const indexes = await client.unsafe<{ indexname: string }[]>(`
      select indexname
      from pg_indexes
      where schemaname = '${schemaName}'
        and tablename in ('users', 'private_chats', 'messages')
      order by indexname
    `);

    const indexNames = new Set(indexes.map((row) => row.indexname));

    expect(indexNames.has("users_username_unique")).toBe(true);
    expect(indexNames.has("private_chats_user1_id_idx")).toBe(true);
    expect(indexNames.has("private_chats_user2_id_idx")).toBe(true);
    expect(indexNames.has("messages_user_id_idx")).toBe(true);
    expect(indexNames.has("messages_reply_to_message_id_idx")).toBe(true);
    expect(indexNames.has("messages_chat_type_id_idx")).toBe(true);
    expect(indexNames.has("messages_chat_id_id_idx")).toBe(true);
    expect(indexNames.has("messages_chat_id_date_id_idx")).toBe(true);
  });
});
