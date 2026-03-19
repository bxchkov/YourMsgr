import "dotenv/config";
import type { ServerWebSocket } from "bun";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import authRoutes from "./routes/auth.routes";
import privateChatRoutes from "./routes/privateChat.routes";
import { AuthService } from "./services/auth.service";
import { MessageService } from "./services/message.service";
import { PrivateChatService } from "./services/privateChat.service";
import type { MessageWithReply } from "./services/reply.service";
import { db } from "./db";
import { corsMiddleware } from "./middleware/cors";
import { rateLimiter } from "./middleware/rateLimit";
import { type TokenPayload, verifyAccessToken, verifyRefreshToken } from "./utils/jwt";
import { validateData, wsDeleteMessageSchema, wsLoadMoreMessagesSchema, wsMessageSchema } from "./utils/validation";

interface WebSocketData {
  userId: number;
  userName: string;
  refreshToken: string;
}

const app = new Hono();
const port = Number(process.env.PORT) || 3000;

app.use("*", corsMiddleware);
app.use(
  "*",
  rateLimiter({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX || 100),
  })
);

app.route("/auth", authRoutes);
app.route("/api/private-chats", privateChatRoutes);

app.get("/", (c) => c.text("Chat Server Running"));

const messageService = new MessageService();
const privateChatService = new PrivateChatService();
const authService = new AuthService();
const clients = new Map<string, ServerWebSocket<WebSocketData>>();

const WS_LIMIT = 5;
const WS_WINDOW = 1000;
const wsRateLimits = new Map<string, { count: number; resetTime: number }>();

const getCookieValue = (cookieHeader: string | null, cookieName: string) => {
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name === cookieName) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
};

const logoutSocketClient = (ws: ServerWebSocket<WebSocketData>) => {
  ws.send(JSON.stringify({ type: "client_logout" }));
  ws.close();
};

const getValidSocketSession = async (
  ws: ServerWebSocket<WebSocketData>,
  accessToken: string
): Promise<{ accessPayload: TokenPayload | null; shouldLogout: boolean }> => {
  const accessPayload = verifyAccessToken(accessToken);

  if (!accessPayload) {
    return { accessPayload: null, shouldLogout: false };
  }

  if (accessPayload.userId !== ws.data.userId) {
    return { accessPayload: null, shouldLogout: true };
  }

  const user = await authService.getValidSessionUser(accessPayload.userId, ws.data.refreshToken);
  if (!user) {
    return { accessPayload: null, shouldLogout: true };
  }

  return { accessPayload, shouldLogout: false };
};

Bun.serve<WebSocketData>({
  port,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/healthz") {
      try {
        await db.execute(sql`select 1`);

        return Response.json({
          success: true,
          message: "Server is healthy",
          data: {
            status: "ok",
            service: "yourmsgr-server",
          },
        });
      } catch (error) {
        console.error("Health check failed:", error);
        return Response.json(
          {
            success: false,
            message: "Server health check failed",
          },
          { status: 500 }
        );
      }
    }

    if (url.pathname === "/ws") {
      const refreshToken = getCookieValue(req.headers.get("cookie"), "refreshToken");
      if (!refreshToken) {
        return new Response("Unauthorized", { status: 401 });
      }

      const payload = verifyRefreshToken(refreshToken);
      if (!payload) {
        return new Response("Unauthorized", { status: 401 });
      }

      const success = server.upgrade(req, {
        data: {
          userId: payload.userId,
          userName: payload.userName,
          refreshToken,
        },
      });

      return success ? undefined : new Response("WebSocket upgrade error", { status: 400 });
    }

    return app.fetch(req, server);
  },
  websocket: {
    async open(ws) {
      const user = await authService.getValidSessionUser(ws.data.userId, ws.data.refreshToken);
      if (!user) {
        console.log(`User ${ws.data.userName} (ID: ${ws.data.userId}) session is invalid, closing connection`);
        logoutSocketClient(ws);
        return;
      }

      const clientId = `${ws.data.userId}-${Date.now()}`;
      clients.set(clientId, ws);
      console.log(`User connected: ${ws.data.userName}`);

      const messages = await messageService.getGroupMessages();
      ws.send(JSON.stringify({ type: "load_messages", chatType: "group", messages }));
    },
    async message(ws, message) {
      try {
        const rateLimitKey = ws.data.userId.toString();
        const now = Date.now();
        const rateLimit = wsRateLimits.get(rateLimitKey) || { count: 0, resetTime: now + WS_WINDOW };

        if (now > rateLimit.resetTime) {
          rateLimit.count = 1;
          rateLimit.resetTime = now + WS_WINDOW;
        } else {
          rateLimit.count += 1;
          if (rateLimit.count > WS_LIMIT) {
            ws.send(JSON.stringify({ type: "error", message: "Слишком частая отправка сообщений (Rate Limit)" }));
            return;
          }
        }

        wsRateLimits.set(rateLimitKey, rateLimit);

        const rawData = JSON.parse(message as string);

        if (rawData.type === "send_message") {
          const data = validateData(wsMessageSchema, rawData);
          if (!data) {
            ws.send(JSON.stringify({ type: "error", message: "Неверный формат сообщения" }));
            return;
          }

          const { accessPayload: userPayload, shouldLogout } = await getValidSocketSession(ws, data.accessToken);
          if (shouldLogout) {
            console.log(`User ${ws.data.userName} session is invalid, logging out`);
            logoutSocketClient(ws);
            return;
          }

          if (!userPayload) {
            ws.send(JSON.stringify({ type: "check_session" }));
            return;
          }

          if (data.chatId && data.recipientId) {
            const newMessage = await privateChatService.sendPrivateMessage(
              data.chatId,
              userPayload.userId,
              userPayload.userName,
              data.message,
              data.recipientId,
              data.nonce,
              data.senderPublicKey,
              data.isEncrypted || 0,
              data.replyToMessageId
            );

            const payload = JSON.stringify({ type: "send_message", ...newMessage });
            clients.forEach((client) => {
              if (client.data.userId === userPayload.userId || client.data.userId === data.recipientId) {
                client.send(payload);
              }
            });
          } else {
            const newMessage = await messageService.createMessage(
              userPayload.userId,
              userPayload.userName,
              data.message,
              data.nonce,
              data.senderPublicKey,
              data.isEncrypted || 0,
              data.replyToMessageId
            );

            const payload = JSON.stringify({ type: "send_message", ...newMessage });
            clients.forEach((client) => {
              client.send(payload);
            });
          }
        }

        if (rawData.type === "delete_message") {
          const data = validateData(wsDeleteMessageSchema, rawData);
          if (!data) {
            ws.send(JSON.stringify({ type: "error", message: "Неверный формат запроса удаления" }));
            return;
          }

          const { accessPayload: userPayload, shouldLogout } = await getValidSocketSession(ws, data.accessToken);
          if (shouldLogout) {
            console.log(`User ${ws.data.userName} session is invalid, logging out`);
            logoutSocketClient(ws);
            return;
          }

          if (!userPayload) {
            ws.send(JSON.stringify({ type: "check_session" }));
            return;
          }

          const msg = await messageService.getMessageById(data.id);
          if (!msg) {
            ws.send(JSON.stringify({ type: "error", message: "Сообщение не найдено" }));
            return;
          }

          if (msg.userId !== userPayload.userId && userPayload.userRole < 3) {
            ws.send(JSON.stringify({ type: "error", message: "Недостаточно прав для удаления" }));
            return;
          }

          await messageService.deleteMessage(data.id);

          const payload = JSON.stringify({ type: "delete_message", id: data.id });
          if (msg.chatType === "private" && msg.recipientId) {
            clients.forEach((client) => {
              if (client.data.userId === msg.userId || client.data.userId === msg.recipientId) {
                client.send(payload);
              }
            });
          } else {
            clients.forEach((client) => {
              client.send(payload);
            });
          }
        }

        if (rawData.type === "load_more_messages") {
          const data = validateData(wsLoadMoreMessagesSchema, rawData);
          if (!data) {
            ws.send(JSON.stringify({ type: "error", message: "Неверный формат запроса истории" }));
            return;
          }

          const { accessPayload: userPayload, shouldLogout } = await getValidSocketSession(ws, data.accessToken);
          if (shouldLogout) {
            console.log(`User ${ws.data.userName} session is invalid, logging out`);
            logoutSocketClient(ws);
            return;
          }

          if (!userPayload) {
            ws.send(JSON.stringify({ type: "check_session" }));
            return;
          }

          let history: MessageWithReply[] = [];
          if (data.chatType === "private" && data.chatId) {
            history = await privateChatService.getPrivateChatMessages(
              data.chatId,
              userPayload.userId,
              data.lastMessageId
            );
          } else {
            history = await messageService.getGroupMessages(data.lastMessageId);
          }

          ws.send(JSON.stringify({ type: "load_messages", chatType: data.chatType, messages: history, isPagination: true }));
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        ws.send(JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "Не удалось обработать действие",
        }));
      }
    },
    close(ws) {
      for (const [clientId, client] of clients.entries()) {
        if (client === ws) {
          clients.delete(clientId);
          console.log(`User disconnected: ${ws.data.userName}`);
          break;
        }
      }
    },
  },
});

console.log(`Server running on http://localhost:${port}`);
