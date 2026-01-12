import { Context } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { AuthService } from "../services/auth.service";
import { validateData, loginSchema, registrationSchema } from "../utils/validation";
import { sendSuccess, sendError } from "../utils/response";
import { verifyAccessToken, verifyRefreshToken, generateTokens, decodeToken } from "../utils/jwt";

const authService = new AuthService();

export class AuthController {
  async register(c: Context) {
    const authHeader = c.req.header("authorization");
    if (!authHeader) {
      return sendError(c, 400, "Missing credentials");
    }

    const [login, password, encodedUsername] = authHeader.split(":");
    if (!login || !password || !encodedUsername) {
      return sendError(c, 400, "Invalid credentials format");
    }

    const username = decodeURIComponent(encodedUsername);
    const validatedData = validateData(registrationSchema, { login, password, username });

    if (!validatedData) {
      return sendError(c, 400, "Invalid input data");
    }

    const result = await authService.register(login, password, username);

    if ("error" in result) {
      return sendError(c, 401, result.error);
    }

    setCookie(c, "refreshToken", result.tokens.refreshToken, {
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return sendSuccess(c, "User registered successfully", {
      accessToken: result.tokens.accessToken,
    });
  }

  async login(c: Context) {
    const authHeader = c.req.header("authorization");
    if (!authHeader) {
      return sendError(c, 400, "Missing credentials");
    }

    const [login, password] = authHeader.split(":");
    if (!login || !password) {
      return sendError(c, 400, "Invalid credentials format");
    }

    const validatedData = validateData(loginSchema, { login, password });

    if (!validatedData) {
      return sendError(c, 400, "Invalid input data");
    }

    const result = await authService.login(login, password);

    if ("error" in result) {
      return sendError(c, 401, result.error);
    }

    setCookie(c, "refreshToken", result.tokens.refreshToken, {
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return sendSuccess(c, "Login successful", {
      accessToken: result.tokens.accessToken,
    });
  }

  async refresh(c: Context) {
    const accessToken = c.req.header("authorization")?.split(" ")[1];
    const refreshToken = getCookie(c, "refreshToken");

    if (!accessToken || !refreshToken) {
      return sendError(c, 403, "Missing tokens");
    }

    const refreshPayload = verifyRefreshToken(refreshToken);
    if (!refreshPayload) {
      return sendError(c, 403, "Invalid refresh token");
    }

    const decodedAccess = decodeToken(accessToken);
    if (!decodedAccess) {
      return sendError(c, 403, "Invalid access token");
    }

    const user = await authService.getUserById(decodedAccess.userId);
    if (!user || user.refreshToken !== refreshToken) {
      return sendError(c, 403, "Token mismatch");
    }

    const newTokens = generateTokens(user.id, user.username, user.role);
    await authService.saveRefreshToken(user.id, newTokens.refreshToken);

    setCookie(c, "refreshToken", newTokens.refreshToken, {
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return sendSuccess(c, "Tokens refreshed", {
      accessToken: newTokens.accessToken,
    });
  }

  async logout(c: Context) {
    const user = c.get("user");
    await authService.clearRefreshToken(user.userId);
    deleteCookie(c, "refreshToken");

    return sendSuccess(c, "Logout successful");
  }

  async session(c: Context) {
    const accessToken = c.req.header("authorization")?.split(" ")[1];
    const refreshToken = getCookie(c, "refreshToken");

    if (!accessToken || !refreshToken) {
      return sendError(c, 403, "Session expired");
    }

    const accessPayload = verifyAccessToken(accessToken);

    if (accessPayload) {
      return sendSuccess(c, "Session valid");
    }

    const refreshPayload = verifyRefreshToken(refreshToken);
    if (!refreshPayload) {
      return sendError(c, 403, "Session expired");
    }

    const decodedAccess = decodeToken(accessToken);
    if (!decodedAccess) {
      return sendError(c, 403, "Invalid token");
    }

    const user = await authService.getUserById(decodedAccess.userId);
    if (!user || user.refreshToken !== refreshToken) {
      return sendError(c, 403, "Session expired");
    }

    const newTokens = generateTokens(user.id, user.username, user.role);
    await authService.saveRefreshToken(user.id, newTokens.refreshToken);

    setCookie(c, "refreshToken", newTokens.refreshToken, {
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return sendSuccess(c, "Session restored with new tokens", {
      accessToken: newTokens.accessToken,
    });
  }
}
