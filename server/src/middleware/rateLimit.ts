import { Context, Next } from "hono";
import { sendError } from "../utils/response";

interface RateLimitStore {
  [ip: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

export const rateLimiter = (options: {
  windowMs: number;
  max: number;
  message?: string;
}) => {
  const { windowMs, max, message = "Слишком много запросов" } = options;

  return async (c: Context, next: Next) => {
    if (
      c.req.path === "/auth/session"
      || c.req.path === "/auth/refresh"
      || c.req.path === "/healthz"
    ) {
      await next();
      return;
    }

    const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwardedFor || c.req.header("x-real-ip") || "unknown";
    const key = `${ip}:${c.req.method}:${c.req.path}`;
    const now = Date.now();

    if (!store[key]) {
      store[key] = { count: 1, resetTime: now + windowMs };
    } else {
      if (now > store[key].resetTime) {
        store[key] = { count: 1, resetTime: now + windowMs };
      } else {
        store[key].count++;

        if (store[key].count > max) {
          return sendError(c, 429, message);
        }
      }
    }

    await next();
  };
};

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const ip in store) {
    if (store[ip].resetTime < now) {
      delete store[ip];
    }
  }
}, 10 * 60 * 1000);
