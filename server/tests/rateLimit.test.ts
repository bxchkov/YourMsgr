import { describe, expect, test } from "bun:test";
import { DEFAULT_RATE_LIMIT_MESSAGE, shouldSkipRateLimit } from "../src/middleware/rateLimit";

describe("rate limiter helpers", () => {
  test("keeps the default user-facing rate limit message readable", () => {
    expect(DEFAULT_RATE_LIMIT_MESSAGE).toBe("Слишком много запросов");
  });

  test("skips session and health endpoints", () => {
    expect(shouldSkipRateLimit("/auth/session")).toBe(true);
    expect(shouldSkipRateLimit("/auth/refresh")).toBe(true);
    expect(shouldSkipRateLimit("/healthz")).toBe(true);
    expect(shouldSkipRateLimit("/auth/login")).toBe(false);
  });
});
