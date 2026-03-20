import { afterEach, describe, expect, test } from "bun:test";
import { publishRealtimeEvent } from "../../src/utils/realtimeEvents";
import { loginUser, registerUser, useTestRuntime } from "./support/testServer";
import { openSocket, waitForSocketMessage } from "./support/wsTestUtils";

const getRuntime = useTestRuntime({ withRealtime: true });

describe("Realtime notify integration", () => {
  const activeSockets: WebSocket[] = [];

  afterEach(() => {
    activeSockets.splice(0).forEach((socket) => socket.close());
  });

  test("fans out force_logout events from Postgres notifications", async () => {
    const { app, origin, client, db, realtimeChannel } = getRuntime();
    const registeredUser = await registerUser(app, {
      login: "notify01",
      username: "Notify",
    });
    const persistedUser = await db.query.users.findFirst();
    if (!persistedUser) {
      throw new Error("Expected registered user to exist");
    }
    const session = await loginUser(origin, {
      login: registeredUser.login,
      password: registeredUser.password,
    });

    const socket = await openSocket(origin, session.cookie);
    activeSockets.push(socket);
    expect((await waitForSocketMessage(socket)).type).toBe("load_messages");

    const logoutEventPromise = waitForSocketMessage(socket);

    await publishRealtimeEvent({
      type: "force_logout",
      userId: persistedUser.id,
    }, client, realtimeChannel);

    const receivedEvent = await logoutEventPromise;
    expect(receivedEvent.type).toBe("client_logout");
  });

  test("broadcasts admin-style group message creation through Postgres notifications", async () => {
    const { app, origin, client, db, dependencies, realtimeChannel } = getRuntime();
    const registeredUser = await registerUser(app, {
      login: "notify02",
      username: "Reader",
    });
    const persistedUser = await db.query.users.findFirst();
    if (!persistedUser) {
      throw new Error("Expected registered user to exist");
    }
    const session = await loginUser(origin, {
      login: registeredUser.login,
      password: registeredUser.password,
    });

    const socket = await openSocket(origin, session.cookie);
    activeSockets.push(socket);
    expect((await waitForSocketMessage(socket)).type).toBe("load_messages");

    const createdMessage = await dependencies.messageService.createMessage(
      persistedUser.id,
      "Admin",
      "Realtime announcement",
    );

    const createdMessagePromise = waitForSocketMessage(socket);

    await publishRealtimeEvent({
      type: "group_message_created",
      messageId: createdMessage.id,
    }, client, realtimeChannel);

    const receivedEvent = await createdMessagePromise;
    expect(receivedEvent.type).toBe("send_message");
    expect(receivedEvent.message).toBe("Realtime announcement");
    expect(receivedEvent.username).toBe("Admin");
  });

  test("targets private chat sync events only to affected users", async () => {
    const { app, origin, client, db, realtimeChannel } = getRuntime();
    const aliceRegistration = await registerUser(app, {
      login: "notify03",
      username: "Alice01",
    });
    const bobRegistration = await registerUser(app, {
      login: "notify04",
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
    const bobUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.login, bobRegistration.login),
    });
    if (!bobUser) {
      throw new Error("Expected Bob user to exist");
    }

    const aliceSocket = await openSocket(origin, aliceSession.cookie);
    const bobSocket = await openSocket(origin, bobSession.cookie);
    activeSockets.push(aliceSocket, bobSocket);

    expect((await waitForSocketMessage(aliceSocket)).type).toBe("load_messages");
    expect((await waitForSocketMessage(bobSocket)).type).toBe("load_messages");

    const targetedEventPromise = waitForSocketMessage(bobSocket);
    const untargetedEventPromise = Promise.race([
      waitForSocketMessage(aliceSocket, 400)
        .then(() => "message")
        .catch(() => "timeout"),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 450)),
    ]);

    await publishRealtimeEvent({
      type: "sync_private_chats",
      userIds: [bobUser.id],
    }, client, realtimeChannel);

    const targetedEvent = await targetedEventPromise;
    expect(targetedEvent.type).toBe("sync_private_chats");

    const noMessageResult = await untargetedEventPromise;
    expect(noMessageResult).toBe("timeout");
  });
});
