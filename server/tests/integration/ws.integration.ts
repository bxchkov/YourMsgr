import { afterEach, describe, expect, test } from "bun:test";
import { fetchJson, loginUser, registerUser, useTestRuntime } from "./support/testServer";
import { openSocket, waitForSocketMessage, waitForSocketMessages } from "./support/wsTestUtils";

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
      username: "Alice01",
      publicKey: "alice-public-key",
    });
    const bobRegistration = await registerUser(app, {
      login: "wsbob01",
      username: "Bob0001",
      publicKey: "bob-public-key",
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
      chatId,
      recipientId: 2,
      message: "Secret hello",
      isEncrypted: 1,
      nonce: "nonce-1",
      senderPublicKey: "spoofed-public-key",
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
    expect(firstReceived.senderPublicKey).toBe("alice-public-key");
    expect(secondReceived.senderPublicKey).toBe("alice-public-key");
  });

  test("pushes private chat sync only to the initiator after HTTP chat creation", async () => {
    const { app, origin } = getRuntime();
    const aliceRegistration = await registerUser(app, {
      login: "syncchat",
      username: "Alice01",
    });
    const bobRegistration = await registerUser(app, {
      login: "syncbob1",
      username: "Bob0001",
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
    const bobSyncPromise = Promise.race([
      waitForSocketMessage(bobSocket, 400)
        .then(() => "message")
        .catch(() => "timeout"),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 450)),
    ]);

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
    expect(await bobSyncPromise).toBe("timeout");
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

  test("pushes username changes to related clients through realtime sync events", async () => {
    const { app, origin } = getRuntime();
    const aliceRegistration = await registerUser(app, {
      login: "renamews",
      username: "Rename01",
    });
    const bobRegistration = await registerUser(app, {
      login: "renameb1",
      username: "Rename02",
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

    const bobSocket = await openSocket(origin, bobSession.cookie);
    activeSockets.push(bobSocket);
    expect((await waitForSocketMessage(bobSocket)).type).toBe("load_messages");

    const syncEventsPromise = waitForSocketMessages(bobSocket, 2);

    const updateResult = await fetchJson<{ accessToken: string; username: string }>(origin, "/auth/username", {
      method: "PATCH",
      cookie: aliceSession.cookie,
      headers: {
        authorization: `Bearer ${aliceSession.accessToken}`,
      },
      body: {
        username: "Rename03",
      },
    });

    expect(updateResult.response.status).toBe(200);

    const syncEvents = await syncEventsPromise;
    const eventTypes = new Set(syncEvents.map((event) => event.type));

    expect(eventTypes.has("sync_group_messages")).toBe(true);
    expect(eventTypes.has("sync_private_chats")).toBe(true);
  });
});
