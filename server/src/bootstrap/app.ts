import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { AuthController } from "../controllers/auth.controller";
import { corsMiddleware } from "../middleware/cors";
import { createAuthMiddleware } from "../middleware/auth";
import { rateLimiter } from "../middleware/rateLimit";
import { createAuthRoutes } from "../routes/auth.routes";
import { createMessageRoutes } from "../routes/messages.routes";
import { createPrivateChatRoutes } from "../routes/privateChat.routes";
import type { AppEnv } from "../types/hono";
import { logger } from "../utils/logger";
import { sendError, sendSuccess } from "../utils/response";
import { REALTIME_EVENTS_CHANNEL } from "../utils/realtimeEvents";
import { createServerDependencies, type ServerDependencies } from "./dependencies";

export interface AppFactoryOptions {
  dependencies?: ServerDependencies;
  realtimeChannel?: string;
}

export const createHttpApp = ({
  dependencies = createServerDependencies(),
  realtimeChannel = REALTIME_EVENTS_CHANNEL,
}: AppFactoryOptions = {}) => {
  const app = new Hono<AppEnv>();
  const authMiddleware = createAuthMiddleware(dependencies.authService);
  const authController = new AuthController(dependencies.authService, realtimeChannel);

  app.use("*", corsMiddleware);
  app.use(
    "*",
    rateLimiter({
      windowMs: Number(process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
      max: Number(process.env.RATE_LIMIT_MAX || 100),
    }),
  );

  app.route("/auth", createAuthRoutes(authController, authMiddleware));
  app.route("/api/messages", createMessageRoutes(dependencies.messageService, authMiddleware));
  app.route("/api/private-chats", createPrivateChatRoutes(dependencies.privateChatService, authMiddleware, realtimeChannel));

  app.get("/", (c) => c.text("Chat Server Running"));
  app.get("/healthz", async (c) => {
    try {
      await dependencies.database.execute(sql`select 1`);

      return sendSuccess(c, "Server is healthy", {
        status: "ok",
        service: "yourmsgr-server",
      });
    } catch (error) {
      logger.error("Health check failed", error);
      return sendError(c, 500, "Server health check failed");
    }
  });

  return app;
};
