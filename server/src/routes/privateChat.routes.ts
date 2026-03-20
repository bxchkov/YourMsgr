import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { PrivateChatService } from "../services/privateChat.service";
import { logger } from "../utils/logger";
import { sendSuccess, sendError } from "../utils/response";
import { publishRealtimeEvent, REALTIME_EVENTS_CHANNEL } from "../utils/realtimeEvents";
import type { AppEnv } from "../types/hono";

export const createPrivateChatRoutes = (
  privateChatService: PrivateChatService = new PrivateChatService(),
  protectedAuthMiddleware = authMiddleware,
  realtimeChannel: string = REALTIME_EVENTS_CHANNEL,
) => {
  const privateChatRoutes = new Hono<AppEnv>();

  privateChatRoutes.use("/*", protectedAuthMiddleware);

  privateChatRoutes.post("/", async (c) => {
    try {
      const user = c.get("user");
      const body = await c.req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return sendError(c, 400, "Invalid request body");
      }

      const otherUserId = Number(body?.otherUserId);

      if (!Number.isInteger(otherUserId) || otherUserId <= 0 || otherUserId === user.userId) {
        return sendError(c, 400, "Invalid user ID");
      }

      const chat = await privateChatService.getOrCreatePrivateChat(user.userId, otherUserId);
      await publishRealtimeEvent({
        type: "sync_private_chats",
        userIds: [user.userId, otherUserId],
      }, undefined, realtimeChannel);

      return sendSuccess(c, "Chat created", { chat });
    } catch (error: unknown) {
      logger.error("Failed to create private chat", error);
      if (error instanceof Error && error.message === "User not found") {
        return sendError(c, 404, "User not found");
      }
      return sendError(c, 500, "Failed to create chat");
    }
  });

  privateChatRoutes.get("/", async (c) => {
    try {
      const user = c.get("user");
      const chats = await privateChatService.getUserPrivateChats(user.userId);

      return sendSuccess(c, "Chats retrieved", { chats });
    } catch (error) {
      logger.error("Failed to fetch private chats", error);
      return sendError(c, 500, "Failed to fetch chats");
    }
  });

  privateChatRoutes.get("/:chatId/messages", async (c) => {
    try {
      const user = c.get("user");
      const chatId = Number(c.req.param("chatId"));
      const lastMessageId = c.req.query("lastMessageId") ? Number(c.req.query("lastMessageId")) : undefined;

      if (!chatId) {
        return sendError(c, 400, "Invalid chat ID");
      }

      const messages = await privateChatService.getPrivateChatMessages(chatId, user.userId, lastMessageId);

      return sendSuccess(c, "Messages retrieved", { messages });
    } catch (error: unknown) {
      logger.error("Failed to fetch private chat messages", error);
      if (error instanceof Error && error.message === "Chat not found or access denied") {
        return sendError(c, 403, error.message);
      }
      return sendError(c, 500, error instanceof Error ? error.message : "Failed to fetch messages");
    }
  });

  return privateChatRoutes;
};

const privateChatRoutes = createPrivateChatRoutes();

export default privateChatRoutes;
