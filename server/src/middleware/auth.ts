import { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { AuthService } from "../services/auth.service";
import type { AppEnv } from "../types/hono";
import { sendError } from "../utils/response";
import { verifyAccessToken, verifyRefreshToken } from "../utils/jwt";

const authService = new AuthService();

export const authMiddleware = async (c: Context<AppEnv>, next: Next) => {
  const authHeader = c.req.header("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(c, 401, "Unauthorized");
  }

  const accessToken = authHeader.split(" ")[1];
  const accessPayload = verifyAccessToken(accessToken);

  if (!accessPayload) {
    return sendError(c, 401, "Invalid or expired token");
  }

  const refreshToken = getCookie(c, "refreshToken");
  if (!refreshToken) {
    return sendError(c, 401, "Session expired");
  }

  const refreshPayload = verifyRefreshToken(refreshToken);
  if (!refreshPayload || refreshPayload.userId !== accessPayload.userId) {
    return sendError(c, 401, "Session expired");
  }

  const user = await authService.getValidSessionUser(accessPayload.userId, refreshToken);
  if (!user) {
    return sendError(c, 401, "Session expired");
  }

  c.set("user", accessPayload);
  await next();
};
