import { Context, Next } from "hono";
import { sendError } from "../utils/response";

type RateLimitState = {
  count: number;
  resetTime: number;
};

const store = new Map<string, RateLimitState>();

export const RATE_LIMIT_SKIP_PATHS = new Set([
  "/healthz",
]);

export const DEFAULT_RATE_LIMIT_MESSAGE = "Слишком много запросов";

export const shouldSkipRateLimit = (path: string) => RATE_LIMIT_SKIP_PATHS.has(path);

export const rateLimiter = (options: {
  windowMs: number;
  max: number;
  message?: string;
}) => {
  const { windowMs, max, message = DEFAULT_RATE_LIMIT_MESSAGE } = options;

  return async (c: Context, next: Next) => {
    if (shouldSkipRateLimit(c.req.path)) {
      await next();
      return;
    }

    const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwardedFor || c.req.header("x-real-ip") || "unknown";
    const key = `${ip}:${c.req.method}:${c.req.path}`;
    const now = Date.now();

    const current = store.get(key);

    if (!current || now > current.resetTime) {
      store.set(key, { count: 1, resetTime: now + windowMs });
    } else {
      const nextState = {
        count: current.count + 1,
        resetTime: current.resetTime,
      };

      store.set(key, nextState);

      if (nextState.count > max) {
        return sendError(c, 429, message);
      }
    }

    await next();
  };
};

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, state] of store.entries()) {
    if (state.resetTime < now) {
      store.delete(key);
    }
  }
}, 10 * 60 * 1000);

cleanupInterval.unref?.();
