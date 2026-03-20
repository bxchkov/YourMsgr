import { describe, expect, test } from "bun:test";
import { useTestRuntime, registerUser, requestJson } from "./support/testServer";
import { messages, users } from "../../src/db/schema";
import { eq } from "drizzle-orm";

const getRuntime = useTestRuntime();

describe("HTTP integration: auth and private chats", () => {
  test("accepts passwords longer than 16 characters during registration", async () => {
    const { app } = getRuntime();
    const longPassword = "AuditPassword_With_Length_32_Value";

    const registeredUser = await registerUser(app, {
      login: "longpass",
      password: longPassword,
      username: "LongPass",
    });

    expect(registeredUser.password).toBe(longPassword);
  });

  test("restores session from refresh cookie and rotates tokens", async () => {
    const { app } = getRuntime();
    const registeredUser = await registerUser(app, {
      login: "authuser",
    });

    const sessionResult = await requestJson<{ accessToken: string }>(app, "/auth/session", {
      cookie: registeredUser.cookie,
    });

    expect(sessionResult.response.status).toBe(200);
    expect(sessionResult.data.success).toBe(true);
    expect(sessionResult.data.data?.accessToken).toBeString();

    const rotatedCookie = sessionResult.response.headers.get("set-cookie");
    expect(rotatedCookie).toContain("refreshToken=");
  });

  test("refreshes tokens through POST /auth/refresh", async () => {
    const { app } = getRuntime();
    const registeredUser = await registerUser(app, {
      login: "refresh01",
    });

    const refreshResult = await requestJson<{ accessToken: string }>(app, "/auth/refresh", {
      method: "POST",
      cookie: registeredUser.cookie,
      headers: {
        authorization: `Bearer ${registeredUser.accessToken}`,
      },
    });

    expect(refreshResult.response.status).toBe(200);
    expect(refreshResult.data.success).toBe(true);
    expect(refreshResult.data.data?.accessToken).toBeString();
  });

  test("stores refresh token hashed at rest", async () => {
    const { app, db } = getRuntime();
    const registeredUser = await registerUser(app, {
      login: "hashedrt",
    });

    const refreshToken = registeredUser.cookie.split("=")[1];
    const storedUser = await db.query.users.findFirst({
      where: eq(users.login, registeredUser.login),
      columns: {
        refreshToken: true,
      },
    });

    expect(storedUser?.refreshToken).toBeString();
    expect(storedUser?.refreshToken).not.toBe(refreshToken);

    const sessionResult = await requestJson<{ accessToken: string }>(app, "/auth/session", {
      cookie: registeredUser.cookie,
    });

    expect(sessionResult.response.status).toBe(200);
    expect(sessionResult.data.success).toBe(true);
  });

  test("rejects protected endpoint when refresh cookie is missing", async () => {
    const { app } = getRuntime();
    const registeredUser = await registerUser(app, {
      login: "nocookie",
    });

    const result = await requestJson(app, "/api/messages/group", {
      headers: {
        authorization: `Bearer ${registeredUser.accessToken}`,
      },
    });

    expect(result.response.status).toBe(401);
    expect(result.data.success).toBe(false);
    expect(result.data.message).toBe("Session expired");
  });

  test("creates and reads private chats for an authenticated user", async () => {
    const { app } = getRuntime();
    const alice = await registerUser(app, {
      login: "alice01",
      username: "Alice01",
    });
    const bob = await registerUser(app, {
      login: "bob0001",
      username: "Bob0001",
    });

    const createChatResult = await requestJson<{ chat: { id: number } }>(app, "/api/private-chats", {
      method: "POST",
      cookie: alice.cookie,
      headers: {
        authorization: `Bearer ${alice.accessToken}`,
      },
      body: {
        otherUserId: 2,
      },
    });

    expect(createChatResult.response.status).toBe(200);
    expect(createChatResult.data.success).toBe(true);
    expect(createChatResult.data.data?.chat.id).toBe(1);

    const listChatsResult = await requestJson<{
      chats: Array<{
        chatId: number;
        otherUser: {
          id: number;
          username: string;
          login: string;
        } | null;
      }>;
    }>(app, "/api/private-chats", {
      cookie: alice.cookie,
      headers: {
        authorization: `Bearer ${alice.accessToken}`,
      },
    });

    expect(listChatsResult.response.status).toBe(200);
    expect(listChatsResult.data.success).toBe(true);
    expect(listChatsResult.data.data?.chats).toHaveLength(1);
    expect(listChatsResult.data.data?.chats[0]?.chatId).toBe(1);
    expect(listChatsResult.data.data?.chats[0]?.otherUser?.id).toBe(2);
    expect(listChatsResult.data.data?.chats[0]?.otherUser?.login).toBe(bob.login);

    const privateMessagesResult = await requestJson<{ messages: unknown[] }>(app, "/api/private-chats/1/messages", {
      cookie: bob.cookie,
      headers: {
        authorization: `Bearer ${bob.accessToken}`,
      },
    });

    expect(privateMessagesResult.response.status).toBe(200);
    expect(privateMessagesResult.data.success).toBe(true);
    expect(privateMessagesResult.data.data?.messages).toHaveLength(0);
  });

  test("rejects malformed private chat payload with 400", async () => {
    const { app } = getRuntime();
    const alice = await registerUser(app, {
      login: "badjson1",
      username: "BadJson",
    });

    const response = await app.fetch(new Request("http://localhost/api/private-chats", {
      method: "POST",
      headers: {
        authorization: `Bearer ${alice.accessToken}`,
        cookie: alice.cookie,
        "content-type": "application/json",
      },
      body: "{",
    }));

    const data = await response.json() as { success: boolean; message?: string };

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.message).toBe("Invalid request body");
  });

  test("updates stored message usernames when username changes", async () => {
    const { app, dependencies, db } = getRuntime();
    const alice = await registerUser(app, {
      login: "rename01",
      username: "Rename01",
    });

    const createdMessage = await dependencies.messageService.createMessage(
      1,
      "Rename01",
      "Original message",
    );

    expect(createdMessage.username).toBe("Rename01");

    const updateResult = await requestJson<{ accessToken: string; username: string }>(app, "/auth/username", {
      method: "PATCH",
      cookie: alice.cookie,
      headers: {
        authorization: `Bearer ${alice.accessToken}`,
      },
      body: {
        username: "Rename02",
      },
    });

    expect(updateResult.response.status).toBe(200);
    expect(updateResult.data.success).toBe(true);
    expect(updateResult.data.data?.username).toBe("Rename02");

    const storedMessage = await db.query.messages.findFirst({
      where: eq(messages.id, createdMessage.id),
      columns: {
        username: true,
      },
    });

    expect(storedMessage?.username).toBe("Rename02");
  });

  test("scopes public keys to the current user's reachable peers", async () => {
    const { app } = getRuntime();
    const alice = await registerUser(app, {
      login: "keyscope1",
      username: "KeyScope1",
      publicKey: "alice-key",
    });
    await registerUser(app, {
      login: "keyscope2",
      username: "KeyScope2",
      publicKey: "bob-key",
    });
    await registerUser(app, {
      login: "keyscope3",
      username: "KeyScope3",
      publicKey: "charlie-key",
    });

    const createChatResult = await requestJson<{ chat: { id: number } }>(app, "/api/private-chats", {
      method: "POST",
      cookie: alice.cookie,
      headers: {
        authorization: `Bearer ${alice.accessToken}`,
      },
      body: {
        otherUserId: 2,
      },
    });

    expect(createChatResult.response.status).toBe(200);

    const publicKeysResult = await requestJson<{
      publicKeys: Array<{ userId: number; username: string; publicKey: string }>;
    }>(app, "/auth/publicKeys", {
      cookie: alice.cookie,
      headers: {
        authorization: `Bearer ${alice.accessToken}`,
      },
    });

    expect(publicKeysResult.response.status).toBe(200);
    expect(publicKeysResult.data.success).toBe(true);

    const keySet = new Set(publicKeysResult.data.data?.publicKeys.map((entry) => entry.publicKey));
    expect(keySet.has("alice-key")).toBe(true);
    expect(keySet.has("bob-key")).toBe(true);
    expect(keySet.has("charlie-key")).toBe(false);
  });
});
