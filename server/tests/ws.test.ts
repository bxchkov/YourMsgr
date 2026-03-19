import { describe, expect, test } from "bun:test";
import { consumeWsRateLimit, getCookieValue } from "../src/utils/ws";

describe("getCookieValue", () => {
  test("returns null when cookie header is missing", () => {
    expect(getCookieValue(null, "refreshToken")).toBeNull();
  });

  test("extracts and decodes target cookie value", () => {
    const cookieHeader = "theme=dark; refreshToken=token%3Dvalue; session=abc";
    expect(getCookieValue(cookieHeader, "refreshToken")).toBe("token=value");
  });
});

describe("consumeWsRateLimit", () => {
  test("allows requests up to the limit and blocks the next one", () => {
    const store = new Map<string, { count: number; resetTime: number }>();
    const now = 1_000;

    expect(consumeWsRateLimit(store, "1", now, 2, 1_000)).toBe(false);
    expect(consumeWsRateLimit(store, "1", now + 10, 2, 1_000)).toBe(false);
    expect(consumeWsRateLimit(store, "1", now + 20, 2, 1_000)).toBe(true);
  });

  test("resets the counter after the window expires", () => {
    const store = new Map<string, { count: number; resetTime: number }>();
    const now = 5_000;

    expect(consumeWsRateLimit(store, "1", now, 1, 1_000)).toBe(false);
    expect(consumeWsRateLimit(store, "1", now + 10, 1, 1_000)).toBe(true);
    expect(consumeWsRateLimit(store, "1", now + 1_100, 1, 1_000)).toBe(false);
  });
});
