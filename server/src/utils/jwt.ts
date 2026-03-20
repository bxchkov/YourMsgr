import jwt from "jsonwebtoken";

export interface TokenPayload {
  userId: number;
  userName: string;
  userRole: number;
  login?: string;
}

const MIN_SECRET_LENGTH = 32;
const JWT_SECRET_PLACEHOLDERS = new Set([
  "your-secret-access-key-here",
  "your-secret-refresh-key-here",
  "change_me",
  "secret",
]);

const assertJwtSecret = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be at least ${MIN_SECRET_LENGTH} characters long`);
  }

  if (JWT_SECRET_PLACEHOLDERS.has(value)) {
    throw new Error(`${name} must not use a placeholder value`);
  }
};

export const assertJwtSecrets = () => {
  assertJwtSecret(process.env.JWT_ACCESS_SECRET, "JWT_ACCESS_SECRET");
  assertJwtSecret(process.env.JWT_REFRESH_SECRET, "JWT_REFRESH_SECRET");
};

export const generateTokens = (userId: number, userName: string, userRole: number = 1, login?: string) => {
  const payload: TokenPayload = { userId, userName, userRole, login };

  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: "15m",
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: "30d",
  });

  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as TokenPayload;
  } catch {
    return null;
  }
};

export const verifyRefreshToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as TokenPayload;
  } catch {
    return null;
  }
};
