import { describe, expect, test } from "bun:test";
import { useTestRuntime, registerUser, requestJson } from "./support/testServer";

const getRuntime = useTestRuntime();

describe("HTTP integration: auth and private chats", () => {
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
      username: "Alice",
    });
    const bob = await registerUser(app, {
      login: "bob0001",
      username: "Bob",
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
});
