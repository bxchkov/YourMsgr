import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { MessageService } from "../services/message.service";
import { sendSuccess } from "../utils/response";

const messageRoutes = new Hono();
const messageService = new MessageService();

messageRoutes.get("/group", authMiddleware, async (c) => {
  const messages = await messageService.getGroupMessages();
  return sendSuccess(c, "Group messages retrieved", { messages });
});

export default messageRoutes;
