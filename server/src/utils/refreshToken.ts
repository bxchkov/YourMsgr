import { createHmac, timingSafeEqual } from "node:crypto";

const REFRESH_TOKEN_HASH_SECRET = process.env.JWT_REFRESH_SECRET ?? "yourmsgr-refresh-token";

export const hashRefreshToken = (refreshToken: string) => {
  return createHmac("sha256", REFRESH_TOKEN_HASH_SECRET)
    .update(refreshToken)
    .digest("hex");
};

export const verifyRefreshTokenHash = (refreshToken: string, storedHash: string | null) => {
  if (!storedHash) {
    return false;
  }

  if (storedHash === refreshToken) {
    return true;
  }

  const incomingHash = hashRefreshToken(refreshToken);
  const incomingBuffer = Buffer.from(incomingHash, "utf8");
  const storedBuffer = Buffer.from(storedHash, "utf8");

  if (incomingBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(incomingBuffer, storedBuffer);
};
