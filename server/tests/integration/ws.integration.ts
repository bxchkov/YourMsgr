import { afterEach, describe, expect, test } from "bun:test";
import { fetchJson, loginUser, registerUser, useTestRuntime } from "./support/testServer";
import { openSocket, waitForSocketMessage } from "./support/wsTestUtils";

const getRuntime = useTestRuntime({ withRealtime: true });

describe("WebSocket integration", () => {
  const activeSockets: WebSocket[] = [];

  afterEach(() => {
    activeSockets.splice(0).forEach((socket) => socket.close());
  });

  test("delivers a private chat message to both participants", async () => {
    const { app, origin } = getRuntime();
    const aliceRegistration = await registerUser(app, {
      login: "wsalice",
      username: "Alice",
    });
    const bobRegistration = await registerUser(app, {
      login: "wsbob01",
      username: "Bob",
    });

    const aliceSession = await loginUser(origin, {
      login: aliceRegistration.login,
      password: aliceRegistration.password,
    });
    const bobSession = await loginUser(origin, {
      login: bobRegistration.login,
      password: bobRegistration.password,
    });

    const createChatResult = await fetchJson<{ chat: { id: number } }>(origin, "/api/private-chats", {
      method: "POST",
      cookie: aliceSession.cookie,
      headers: {
        authorization: `Bearer ${aliceSession.accessToken}`,
      },
      body: {
        otherUserId: 2,
      },
    });

    expect(createChatResult.response.status).toBe(200);
    const chatId = createChatResult.data.data?.chat.id;
    expect(chatId).toBe(1);

    const aliceSocket = await openSocket(origin, aliceSession.cookie);
    const bobSocket = await openSocket(origin, bobSession.cookie);
    activeSockets.push(aliceSocket, bobSocket);

    const aliceInitial = await waitForSocketMessage(aliceSocket);
    const bobInitial = await waitForSocketMessage(bobSocket);

    expect(aliceInitial.type).toBe("load_messages");
    expect(bobInitial.type).toBe("load_messages");

    aliceSocket.send(JSON.stringify({
      type: "send_message",
      accessToken: aliceSession.accessToken,
      chatId,
      recipientId: 2,
      message: "Secret hello",
      isEncrypted: 1,
      nonce: "nonce-1",
      senderPublicKey: "public-key-1",
    }));

    const firstReceived = await waitForSocketMessage(aliceSocket);
    const secondReceived = await waitForSocketMessage(bobSocket);

    expect(firstReceived.type).toBe("send_message");
    expect(secondReceived.type).toBe("send_message");
    expect(firstReceived.chatType).toBe("private");
    expect(secondReceived.chatType).toBe("private");
    expect(firstReceived.message).toBe("Secret hello");
    expect(secondReceived.message).toBe("Secret hello");
    expect(firstReceived.recipientId).toBe(2);
    expect(secondReceived.recipientId).toBe(2);
  });

  test("pushes private chat sync to both participants after HTTP chat creation", async () => {
    const { app, origin } = getRuntime();
    const aliceRegistration = await registerUser(app, {
      login: "syncchat",
      username: "Alice",
    });
    const bobRegistration = await registerUser(app, {
      login: "syncbob1",
      username: "Bob",
    });

    const aliceSession = await loginUser(origin, {
      login: aliceRegistration.login,
      password: aliceRegistration.password,
    });
    const bobSession = await loginUser(origin, {
      login: bobRegistration.login,
      password: bobRegistration.password,
    });

    const aliceSocket = await openSocket(origin, aliceSession.cookie);
    const bobSocket = await openSocket(origin, bobSession.cookie);
    activeSockets.push(aliceSocket, bobSocket);

    expect((await waitForSocketMessage(aliceSocket)).type).toBe("load_messages");
    expect((await waitForSocketMessage(bobSocket)).type).toBe("load_messages");

    const aliceSyncPromise = waitForSocketMessage(aliceSocket);
    const bobSyncPromise = waitForSocketMessage(bobSocket);

    const createChatResult = await fetchJson<{ chat: { id: number } }>(origin, "/api/private-chats", {
      method: "POST",
      cookie: aliceSession.cookie,
      headers: {
        authorization: `Bearer ${aliceSession.accessToken}`,
      },
      body: {
        otherUserId: 2,
      },
    });

    expect(createChatResult.response.status).toBe(200);
    expect(createChatResult.data.data?.chat.id).toBe(1);

    expect((await aliceSyncPromise).type).toBe("sync_private_chats");
    expect((await bobSyncPromise).type).toBe("sync_private_chats");
  });

  test("logs out an already connected socket immediately after HTTP logout", async () => {
    const { app, origin } = getRuntime();
    const aliceRegistration = await registerUser(app, {
      login: "logout1",
      username: "Logout",
    });
    const aliceSession = await loginUser(origin, {
      login: aliceRegistration.login,
      password: aliceRegistration.password,
    });

    const aliceSocket = await openSocket(origin, aliceSession.cookie);
    activeSockets.push(aliceSocket);

    const initialLoad = await waitForSocketMessage(aliceSocket);
    expect(initialLoad.type).toBe("load_messages");

    const logoutMessagePromise = waitForSocketMessage(aliceSocket);

    const logoutResult = await fetchJson(origin, "/auth/logout", {
      method: "POST",
      cookie: aliceSession.cookie,
      headers: {
        authorization: `Bearer ${aliceSession.accessToken}`,
      },
    });

    expect(logoutResult.response.status).toBe(200);

    const logoutMessage = await logoutMessagePromise;
    expect(logoutMessage.type).toBe("client_logout");
  });
});
