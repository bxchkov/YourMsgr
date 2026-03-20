import type { Server as BunServer, ServerWebSocket } from "bun";
import { type TokenPayload, verifyAccessToken, verifyRefreshToken } from "../utils/jwt";
import { logger } from "../utils/logger";
import { listenToRealtimeEvents, REALTIME_EVENTS_CHANNEL } from "../utils/realtimeEvents";
import { validateData, wsDeleteMessageSchema, wsLoadMoreMessagesSchema, wsMessageSchema } from "../utils/validation";
import { consumeWsRateLimit, getCookieValue, type WsRateLimitState, WS_ERROR_MESSAGES } from "../utils/ws";
import type { MessageWithReply } from "../services/reply.service";
import { createHttpApp, type AppFactoryOptions } from "./app";
import { createServerDependencies } from "./dependencies";

export interface WebSocketData {
  userId: number;
  userName: string;
  refreshToken: string;
}

export interface RealtimeServerOptions extends AppFactoryOptions {
  port?: number;
  realtimeChannel?: string;
}

const WS_LIMIT = 5;
const WS_WINDOW = 1000;

export const createRealtimeServer = async ({
  port = Number(process.env.PORT) || 3000,
  dependencies,
  realtimeChannel = REALTIME_EVENTS_CHANNEL,
}: RealtimeServerOptions = {}) => {
  const resolvedDependencies = dependencies ?? createServerDependencies();
  const app = createHttpApp({ dependencies: resolvedDependencies, realtimeChannel });
  const clients = new Map<string, ServerWebSocket<WebSocketData>>();
  const wsRateLimits = new Map<string, WsRateLimitState>();

  const removeSocketClient = (ws: ServerWebSocket<WebSocketData>) => {
    for (const [clientId, client] of clients.entries()) {
      if (client === ws) {
        clients.delete(clientId);
        return true;
      }
    }

    return false;
  };

  const safeSendToClient = (ws: ServerWebSocket<WebSocketData>, payload: string) => {
    try {
      ws.send(payload);
      return true;
    } catch (error) {
      removeSocketClient(ws);
      logger.warn(`Failed to deliver realtime payload to '${ws.data.userName}'`, error);
      return false;
    }
  };

  const broadcastToAll = (payload: string) => {
    clients.forEach((client) => {
      safeSendToClient(client, payload);
    });
  };

  const broadcastToUsers = (userIds: number[], payload: string) => {
    const targetUserIds = new Set(userIds);
    clients.forEach((client) => {
      if (targetUserIds.has(client.data.userId)) {
        safeSendToClient(client, payload);
      }
    });
  };

  const logoutSocketClient = (ws: ServerWebSocket<WebSocketData>) => {
    safeSendToClient(ws, JSON.stringify({ type: "client_logout" }));
    ws.close();
  };

  const logoutUserSockets = (userId: number) => {
    for (const client of clients.values()) {
      if (client.data.userId === userId) {
        logoutSocketClient(client);
      }
    }
  };

  const getValidSocketSession = async (
    ws: ServerWebSocket<WebSocketData>,
    accessToken: string,
  ): Promise<{ accessPayload: TokenPayload | null; shouldLogout: boolean }> => {
    const accessPayload = verifyAccessToken(accessToken);

    if (!accessPayload) {
      return { accessPayload: null, shouldLogout: false };
    }

    if (accessPayload.userId !== ws.data.userId) {
      return { accessPayload: null, shouldLogout: true };
    }

    const user = await resolvedDependencies.authService.getValidSessionUser(accessPayload.userId, ws.data.refreshToken);
    if (!user) {
      return { accessPayload: null, shouldLogout: true };
    }

    return { accessPayload, shouldLogout: false };
  };

  const realtimeListener = await listenToRealtimeEvents(async (event) => {
    switch (event.type) {
      case "force_logout":
        logoutUserSockets(event.userId);
        return;

      case "sync_group_messages":
        broadcastToAll(JSON.stringify({ type: "sync_group_messages" }));
        return;

      case "sync_private_chats":
        broadcastToUsers(event.userIds, JSON.stringify({ type: "sync_private_chats" }));
        return;

      case "group_message_created": {
        const createdMessage = await resolvedDependencies.messageService.getMessageWithReplyById(event.messageId);
        if (!createdMessage) {
          logger.warn(`Realtime event message not found: ${event.messageId}`);
          return;
        }

        broadcastToAll(JSON.stringify({ type: "send_message", ...createdMessage }));
      }
    }
  }, undefined, realtimeChannel);

  const server = Bun.serve<WebSocketData>({
    port,
    async fetch(req, bunServer) {
      const url = new URL(req.url);

      if (url.pathname === "/ws") {
        const refreshToken = getCookieValue(req.headers.get("cookie"), "refreshToken");
        if (!refreshToken) {
          return new Response("Unauthorized", { status: 401 });
        }

        const payload = verifyRefreshToken(refreshToken);
        if (!payload) {
          return new Response("Unauthorized", { status: 401 });
        }

        const success = bunServer.upgrade(req, {
          data: {
            userId: payload.userId,
            userName: payload.userName,
            refreshToken,
          },
        });

        return success ? undefined : new Response("WebSocket upgrade error", { status: 400 });
      }

      return app.fetch(req, bunServer);
    },
    websocket: {
      async open(ws) {
        const user = await resolvedDependencies.authService.getValidSessionUser(ws.data.userId, ws.data.refreshToken);
        if (!user) {
          logger.warn(`WebSocket session is invalid during open for '${ws.data.userName}' (ID: ${ws.data.userId})`);
          logoutSocketClient(ws);
          return;
        }

        const clientId = `${ws.data.userId}-${Date.now()}`;
        clients.set(clientId, ws);
        logger.info(`WebSocket client connected: ${ws.data.userName}`);

        const messages = await resolvedDependencies.messageService.getGroupMessages();
        ws.send(JSON.stringify({ type: "load_messages", chatType: "group", messages }));
      },
      async message(ws, message) {
        try {
          const rateLimitKey = ws.data.userId.toString();
          const now = Date.now();

          if (consumeWsRateLimit(wsRateLimits, rateLimitKey, now, WS_LIMIT, WS_WINDOW)) {
            ws.send(JSON.stringify({ type: "error", message: WS_ERROR_MESSAGES.rateLimit }));
            return;
          }

          const rawData = JSON.parse(message as string);

          if (rawData.type === "send_message") {
            const data = validateData(wsMessageSchema, rawData);
            if (!data) {
              ws.send(JSON.stringify({ type: "error", message: WS_ERROR_MESSAGES.invalidMessageFormat }));
              return;
            }

            const { accessPayload: userPayload, shouldLogout } = await getValidSocketSession(ws, data.accessToken);
            if (shouldLogout) {
              logger.warn(`WebSocket send_message session is invalid for '${ws.data.userName}'`);
              logoutSocketClient(ws);
              return;
            }

            if (!userPayload) {
              ws.send(JSON.stringify({ type: "check_session" }));
              return;
            }

            if (data.chatId && data.recipientId) {
              const newMessage = await resolvedDependencies.privateChatService.sendPrivateMessage(
                data.chatId,
                userPayload.userId,
                userPayload.userName,
                data.message,
                data.recipientId,
                data.nonce,
                data.senderPublicKey,
                data.isEncrypted || 0,
                data.replyToMessageId,
              );

              const payload = JSON.stringify({ type: "send_message", ...newMessage });
              clients.forEach((client) => {
                if (client.data.userId === userPayload.userId || client.data.userId === data.recipientId) {
                  safeSendToClient(client, payload);
                }
              });
              return;
            }

            const newMessage = await resolvedDependencies.messageService.createMessage(
              userPayload.userId,
              userPayload.userName,
              data.message,
              data.nonce,
              data.senderPublicKey,
              data.isEncrypted || 0,
              data.replyToMessageId,
            );

            const payload = JSON.stringify({ type: "send_message", ...newMessage });
            clients.forEach((client) => {
              safeSendToClient(client, payload);
            });
            return;
          }

          if (rawData.type === "delete_message") {
            const data = validateData(wsDeleteMessageSchema, rawData);
            if (!data) {
              ws.send(JSON.stringify({ type: "error", message: WS_ERROR_MESSAGES.invalidDeleteRequest }));
              return;
            }

            const { accessPayload: userPayload, shouldLogout } = await getValidSocketSession(ws, data.accessToken);
            if (shouldLogout) {
              logger.warn(`WebSocket delete_message session is invalid for '${ws.data.userName}'`);
              logoutSocketClient(ws);
              return;
            }

            if (!userPayload) {
              ws.send(JSON.stringify({ type: "check_session" }));
              return;
            }

            const msg = await resolvedDependencies.messageService.getMessageById(data.id);
            if (!msg) {
              ws.send(JSON.stringify({ type: "error", message: WS_ERROR_MESSAGES.messageNotFound }));
              return;
            }

            if (msg.userId !== userPayload.userId && userPayload.userRole < 3) {
              ws.send(JSON.stringify({ type: "error", message: WS_ERROR_MESSAGES.insufficientDeletePermissions }));
              return;
            }

            await resolvedDependencies.messageService.deleteMessage(data.id);

            const payload = JSON.stringify({ type: "delete_message", id: data.id });
            if (msg.chatType === "private" && msg.recipientId) {
              clients.forEach((client) => {
                if (client.data.userId === msg.userId || client.data.userId === msg.recipientId) {
                  safeSendToClient(client, payload);
                }
              });
              return;
            }

            clients.forEach((client) => {
              safeSendToClient(client, payload);
            });
            return;
          }

          if (rawData.type === "load_more_messages") {
            const data = validateData(wsLoadMoreMessagesSchema, rawData);
            if (!data) {
              ws.send(JSON.stringify({ type: "error", message: WS_ERROR_MESSAGES.invalidHistoryRequest }));
              return;
            }

            const { accessPayload: userPayload, shouldLogout } = await getValidSocketSession(ws, data.accessToken);
            if (shouldLogout) {
              logger.warn(`WebSocket load_more_messages session is invalid for '${ws.data.userName}'`);
              logoutSocketClient(ws);
              return;
            }

            if (!userPayload) {
              ws.send(JSON.stringify({ type: "check_session" }));
              return;
            }

            let history: MessageWithReply[] = [];
            if (data.chatType === "private" && data.chatId) {
              history = await resolvedDependencies.privateChatService.getPrivateChatMessages(
                data.chatId,
                userPayload.userId,
                data.lastMessageId,
              );
            } else {
              history = await resolvedDependencies.messageService.getGroupMessages(data.lastMessageId);
            }

            ws.send(JSON.stringify({
              type: "load_messages",
              chatType: data.chatType,
              messages: history,
              isPagination: true,
            }));
          }
        } catch (error) {
          logger.error("WebSocket message handling failed", error);
          ws.send(JSON.stringify({
            type: "error",
            message: error instanceof Error ? error.message : WS_ERROR_MESSAGES.actionFailed,
          }));
        }
      },
      close(ws) {
        if (removeSocketClient(ws)) {
          logger.info(`WebSocket client disconnected: ${ws.data.userName}`);
        }
      },
    },
  });

  return {
    app,
    server: server as BunServer,
    dependencies: resolvedDependencies,
    async stop() {
      await realtimeListener.unlisten();
      server.stop(true);
    },
  };
};
