import "dotenv/config";
import { Hono } from "hono";
import { Server } from "socket.io";
import { corsMiddleware } from "./middleware/cors";
import { rateLimiter } from "./middleware/rateLimit";
import authRoutes from "./routes/auth.routes";
import { MessageService } from "./services/message.service";
import { verifyAccessToken } from "./utils/jwt";

const app = new Hono();
const port = Number(process.env.PORT) || 3000;

// Middleware
app.use("*", corsMiddleware);
app.use(
  "*",
  rateLimiter({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX || 100),
  })
);

// Routes
app.route("/auth", authRoutes);

app.get("/", (c) => c.text("Chat Server Running"));

// HTTP Server (Bun native)
const server = Bun.serve({
  port,
  fetch: app.fetch,
});

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:5173"],
    credentials: true,
  },
});

const messageService = new MessageService();

io.on("connection", async (socket) => {
  const accessToken = socket.handshake.query.accessToken as string;

  if (!accessToken) {
    socket.emit("client_logout");
    socket.disconnect();
    return;
  }

  const payload = verifyAccessToken(accessToken);
  if (!payload) {
    socket.emit("check_session");
    socket.disconnect();
    return;
  }

  console.log(`User connected: ${payload.userName}`);

  // Load all messages
  const messages = await messageService.getAllMessages();
  socket.emit("load_messages", { messages });

  // Send message
  socket.on("send_message", async (data) => {
    const token = data.accessToken;
    const userPayload = verifyAccessToken(token);

    if (!userPayload) {
      socket.emit("check_session");
      return;
    }

    const newMessage = await messageService.createMessage(
      userPayload.userId,
      userPayload.userName,
      data.message
    );

    io.emit("send_message", newMessage);
  });

  // Delete message
  socket.on("delete_message", async (data) => {
    const token = data.accessToken;
    const userPayload = verifyAccessToken(token);

    if (!userPayload) {
      socket.emit("check_session");
      return;
    }

    const message = await messageService.getMessageById(data.id);

    if (!message) return;

    // Check permissions: user can delete their own messages or admin can delete any
    if (message.userId !== userPayload.userId && userPayload.userRole < 3) {
      socket.emit("check_session");
      return;
    }

    await messageService.deleteMessage(data.id);
    io.emit("delete_message", { id: data.id });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${payload.userName}`);
  });
});

console.log(`🚀 Server running on http://localhost:${port}`);
