import { describe, expect, test } from "bun:test";
import { assertIdentityIsAllowed, isReservedIdentity, normalizeIdentity } from "../src/utils/identity";

describe("identity helpers", () => {
  test("normalizes user identities before validation", () => {
    expect(normalizeIdentity("  Admin  ")).toBe("admin");
  });

  test("detects reserved identities case-insensitively", () => {
    expect(isReservedIdentity("Administrator")).toBe(true);
    expect(isReservedIdentity("mod")).toBe(true);
    expect(isReservedIdentity("regular_user")).toBe(false);
  });

  test("throws for reserved logins and usernames", () => {
    expect(() => assertIdentityIsAllowed("owner", "login")).toThrow("Reserved login");
    expect(() => assertIdentityIsAllowed("support", "username")).toThrow("Reserved username");
  });
});
