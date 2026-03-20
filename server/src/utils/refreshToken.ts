import { createHmac, timingSafeEqual } from "node:crypto";

const getRefreshTokenHashSecret = () => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error("JWT_REFRESH_SECRET is required");
  }

  return secret;
};

export const hashRefreshToken = (refreshToken: string) => {
  return createHmac("sha256", getRefreshTokenHashSecret())
    .update(refreshToken)
    .digest("hex");
};

export const verifyRefreshTokenHash = (refreshToken: string, storedHash: string | null) => {
  if (!storedHash) {
    return false;
  }

  const incomingHash = hashRefreshToken(refreshToken);
  const incomingBuffer = Buffer.from(incomingHash, "utf8");
  const storedBuffer = Buffer.from(storedHash, "utf8");

  if (incomingBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(incomingBuffer, storedBuffer);
};
