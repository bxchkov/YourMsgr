import { beforeEach, describe, expect, it } from "bun:test";

describe("refresh token hashing", () => {
  beforeEach(() => {
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  });

  it("hashes refresh tokens and validates only the hashed form", async () => {
    const { hashRefreshToken, verifyRefreshTokenHash } = await import("../src/utils/refreshToken");

    const refreshToken = "sample-refresh-token";
    const hashed = hashRefreshToken(refreshToken);

    expect(hashed).not.toBe(refreshToken);
    expect(verifyRefreshTokenHash(refreshToken, hashed)).toBe(true);
    expect(verifyRefreshTokenHash(refreshToken, refreshToken)).toBe(false);
  });
});
