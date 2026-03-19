import { afterEach, describe, expect, test } from "bun:test";
import { fetchJson, loginUser, registerUser, useTestRuntime } from "./support/testServer";

type WsEnvelope = Record<string, unknown>;

const getRuntime = useTestRuntime({ withRealtime: true });

const waitForSocketMessage = async (socket: WebSocket, timeoutMs = 5_000): Promise<WsEnvelope> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out while waiting for a WebSocket message"));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("error", handleError);
    };

    const handleMessage = (event: MessageEvent) => {
      cleanup();
      resolve(JSON.parse(String(event.data)) as WsEnvelope);
    };

    const handleError = (event: Event) => {
      cleanup();
      reject(event);
    };

    socket.addEventListener("message", handleMessage, { once: true });
    socket.addEventListener("error", handleError, { once: true });
  });
};

const openSocket = async (origin: string, cookie: string) => {
  const websocketOrigin = origin.replace("http://", "ws://").replace("https://", "wss://");
  const socket = new WebSocket(`${websocketOrigin}/ws`, {
    headers: {
      cookie,
    },
  } as never);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out while opening a WebSocket connection"));
    }, 5_000);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("error", handleError);
    };

    const handleOpen = () => {
      cleanup();
      resolve();
    };

    const handleError = (event: Event) => {
      cleanup();
      reject(event);
    };

    socket.addEventListener("open", handleOpen, { once: true });
    socket.addEventListener("error", handleError, { once: true });
  });

  return socket;
};

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

  test("logs out an already connected socket after the session becomes invalid", async () => {
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

    const logoutResult = await fetchJson(origin, "/auth/logout", {
      method: "POST",
      cookie: aliceSession.cookie,
      headers: {
        authorization: `Bearer ${aliceSession.accessToken}`,
      },
    });

    expect(logoutResult.response.status).toBe(200);

    aliceSocket.send(JSON.stringify({
      type: "send_message",
      accessToken: aliceSession.accessToken,
      message: "Should fail",
      isEncrypted: 0,
    }));

    const logoutMessage = await waitForSocketMessage(aliceSocket);
    expect(logoutMessage.type).toBe("client_logout");
  });
});
