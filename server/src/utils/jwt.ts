import jwt from "jsonwebtoken";

export interface TokenPayload {
  userId: number;
  userName: string;
  userRole: number;
  login?: string;
}

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
