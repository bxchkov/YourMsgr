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
  const { windowMs, max, message = "Too many requests" } = options;

  return async (c: Context, next: Next) => {
    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
    const now = Date.now();

    if (!store[ip]) {
      store[ip] = { count: 1, resetTime: now + windowMs };
    } else {
      if (now > store[ip].resetTime) {
        store[ip] = { count: 1, resetTime: now + windowMs };
      } else {
        store[ip].count++;

        if (store[ip].count > max) {
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
