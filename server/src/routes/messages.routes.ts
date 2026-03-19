import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { MessageService } from "../services/message.service";
import { sendSuccess } from "../utils/response";

export const createMessageRoutes = (
  messageService: MessageService = new MessageService(),
  protectedAuthMiddleware = authMiddleware,
) => {
  const messageRoutes = new Hono();

  messageRoutes.get("/group", protectedAuthMiddleware, async (c) => {
    const messages = await messageService.getGroupMessages();
    return sendSuccess(c, "Group messages retrieved", { messages });
  });

  return messageRoutes;
};

const messageRoutes = createMessageRoutes();

export default messageRoutes;
