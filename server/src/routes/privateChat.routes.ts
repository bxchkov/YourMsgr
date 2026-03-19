import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { PrivateChatService } from "../services/privateChat.service";
import { sendSuccess, sendError } from "../utils/response";
import type { AppEnv } from "../types/hono";

const privateChatRoutes = new Hono<AppEnv>();
const privateChatService = new PrivateChatService();

privateChatRoutes.use("/*", authMiddleware);

privateChatRoutes.post("/", async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json();
    const otherUserId = Number(body?.otherUserId);

    if (!Number.isInteger(otherUserId) || otherUserId <= 0 || otherUserId === user.userId) {
      return sendError(c, 400, "Invalid user ID");
    }

    const chat = await privateChatService.getOrCreatePrivateChat(user.userId, otherUserId);

    return sendSuccess(c, "Chat created", { chat });
  } catch (error: unknown) {
    console.error("Error creating private chat:", error);
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
    console.error("Error fetching private chats:", error);
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
    console.error("Error fetching messages:", error);
    if (error instanceof Error && error.message === "Chat not found or access denied") {
      return sendError(c, 403, error.message);
    }
    return sendError(c, 500, error instanceof Error ? error.message : "Failed to fetch messages");
  }
});

export default privateChatRoutes;
