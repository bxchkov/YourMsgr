import { describe, expect, test } from "bun:test";
import { useTestRuntime } from "./support/testServer";

const getRuntime = useTestRuntime();

const expectQueryToFail = async (query: Promise<unknown>) => {
  let failed = false;

  try {
    await query;
  } catch {
    failed = true;
  }

  expect(failed).toBe(true);
};

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

    await expectQueryToFail(
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
      `),
    );
  });

  test("enforces basic check constraints at database level", async () => {
    const { client } = getRuntime();

    await expectQueryToFail(
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
      `),
    );

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

    await expectQueryToFail(
      client.unsafe(`
        insert into private_chats (user1_id, user2_id)
        values (1, 1)
      `),
    );

    await expectQueryToFail(
      client.unsafe(`
        insert into messages (user_id, username, message, chat_type, is_encrypted)
        values (1, 'ValidUser', 'Bad type', 'broadcast', 0)
      `),
    );

    await expectQueryToFail(
      client.unsafe(`
        insert into messages (user_id, username, message, chat_type, is_encrypted)
        values (1, 'ValidUser', 'Bad flag', 'group', 5)
      `),
    );
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

    const serializedIndexes = JSON.stringify(indexes);

    expect(serializedIndexes).toContain("private_chats_user1_id_idx");
    expect(serializedIndexes).toContain("private_chats_user2_id_idx");
    expect(serializedIndexes).toContain("messages_user_id_idx");
    expect(serializedIndexes).toContain("messages_reply_to_message_id_idx");
    expect(serializedIndexes).toContain("messages_chat_type_id_idx");
    expect(serializedIndexes).toContain("messages_chat_id_id_idx");
    expect(serializedIndexes).not.toContain("messages_chat_id_date_id_idx");
  });

  test("does not include stricter legacy guards that are outside the agreed safe DB scope", async () => {
    const { client, schemaName } = getRuntime();

    const constraints = await client.unsafe<{ conname: string }[]>(`
      select conname
      from pg_constraint
      where connamespace = '${schemaName}'::regnamespace
        and conname in (
          'private_chats_user_order_check',
          'messages_chat_consistency_check',
          'messages_chat_id_private_chats_id_fk'
        )
      order by conname
    `);

    expect(JSON.stringify(constraints)).toBe("[]");
  });
});
