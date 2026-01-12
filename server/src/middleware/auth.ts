import { Context, Next } from "hono";
import { verifyAccessToken } from "../utils/jwt";
import { sendError } from "../utils/response";

export const authMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(c, 401, "Unauthorized");
  }

  const token = authHeader.split(" ")[1];
  const payload = verifyAccessToken(token);

  if (!payload) {
    return sendError(c, 401, "Invalid or expired token");
  }

  c.set("user", payload);
  await next();
};
