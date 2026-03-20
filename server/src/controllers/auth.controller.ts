import { Context } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { AuthService } from "../services/auth.service";
import { loginSchema, registrationSchema, usernameSchema } from "../utils/validation";
import { sendSuccess, sendError } from "../utils/response";
import { verifyAccessToken, verifyRefreshToken, generateTokens } from "../utils/jwt";
import { publishRealtimeEvent, REALTIME_EVENTS_CHANNEL } from "../utils/realtimeEvents";

type LoginCredentials = {
  login: string;
  password: string;
};

type RegistrationCredentials = LoginCredentials & {
  username: string;
  publicKey: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIv: string;
  encryptedPrivateKeySalt: string;
};

export class AuthController {
  constructor(
    private readonly authService: AuthService = new AuthService(),
    private readonly realtimeChannel: string = REALTIME_EVENTS_CHANNEL,
  ) {}

  private getFirstValidationErrorMessage(result: { error?: { issues?: Array<{ message?: string }> } }, fallback: string) {
    return result.error?.issues?.[0]?.message || fallback;
  }

  private isSecureRequest(c: Context): boolean {
    const forwardedProto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    if (forwardedProto) {
      return forwardedProto === "https";
    }

    return new URL(c.req.url).protocol === "https:";
  }

  private getRefreshCookieOptions(c: Context) {
    return {
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
      secure: this.isSecureRequest(c),
      sameSite: "strict" as const,
      path: "/",
    };
  }

  private async readJsonBody<T>(c: Context): Promise<T | null> {
    const contentType = c.req.header("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return null;
    }

    try {
      return await c.req.json<T>();
    } catch {
      return null;
    }
  }

  async register(c: Context) {
    const body = await this.readJsonBody<Partial<RegistrationCredentials>>(c);
    if (!body) {
      return sendError(c, 400, "Missing credentials");
    }

    const validatedData = registrationSchema.safeParse(body);
    if (!validatedData.success) {
      return sendError(c, 400, this.getFirstValidationErrorMessage(validatedData, "Invalid input data"));
    }

    const result = await this.authService.register(
      validatedData.data.login,
      validatedData.data.password,
      validatedData.data.username,
      validatedData.data.publicKey,
      validatedData.data.encryptedPrivateKey,
      validatedData.data.encryptedPrivateKeyIv,
      validatedData.data.encryptedPrivateKeySalt,
    );

    if ("error" in result) {
      return sendError(c, 401, result.error ?? "Registration failed");
    }

    setCookie(c, "refreshToken", result.tokens.refreshToken, this.getRefreshCookieOptions(c));

    return sendSuccess(c, "User registered successfully", {
      accessToken: result.tokens.accessToken,
    });
  }

  async login(c: Context) {
    const body = await this.readJsonBody<Partial<LoginCredentials>>(c);
    if (!body) {
      return sendError(c, 400, "Missing credentials");
    }

    const validatedData = loginSchema.safeParse(body);
    if (!validatedData.success) {
      return sendError(c, 400, this.getFirstValidationErrorMessage(validatedData, "Invalid input data"));
    }

    const result = await this.authService.login(validatedData.data.login, validatedData.data.password);

    if ("error" in result) {
      return sendError(c, 401, result.error ?? "Login failed");
    }

    setCookie(c, "refreshToken", result.tokens.refreshToken, this.getRefreshCookieOptions(c));

    return sendSuccess(c, "Login successful", {
      accessToken: result.tokens.accessToken,
      encryptedPrivateKey: result.encryptedPrivateKey,
      encryptedPrivateKeyIv: result.encryptedPrivateKeyIv,
      encryptedPrivateKeySalt: result.encryptedPrivateKeySalt,
    });
  }

  async refresh(c: Context) {
    const accessToken = c.req.header("authorization")?.split(" ")[1];
    const refreshToken = getCookie(c, "refreshToken");

    if (!refreshToken) {
      return sendError(c, 403, "Missing refresh token");
    }

    const refreshPayload = verifyRefreshToken(refreshToken);
    if (!refreshPayload) {
      return sendError(c, 403, "Invalid refresh token");
    }

    const user = await this.authService.getValidSessionUser(refreshPayload.userId, refreshToken);
    if (!user) {
      return sendError(c, 403, "Token mismatch");
    }

    const accessPayload = accessToken ? verifyAccessToken(accessToken) : null;
    if (accessPayload && accessPayload.userId !== user.id) {
      return sendError(c, 403, "Token mismatch");
    }

    const newTokens = generateTokens(user.id, user.username, user.role, user.login);
    await this.authService.saveRefreshToken(user.id, newTokens.refreshToken);

    setCookie(c, "refreshToken", newTokens.refreshToken, this.getRefreshCookieOptions(c));

    return sendSuccess(c, "Tokens refreshed", {
      accessToken: newTokens.accessToken,
    });
  }

  async logout(c: Context) {
    const accessToken = c.req.header("authorization")?.split(" ")[1];
    const refreshToken = getCookie(c, "refreshToken");
    let logoutUserId: number | null = null;

    const accessPayload = accessToken ? verifyAccessToken(accessToken) : null;
    const refreshPayload = refreshToken ? verifyRefreshToken(refreshToken) : null;

    if (accessPayload?.userId) {
      await this.authService.clearRefreshToken(accessPayload.userId);
      logoutUserId = accessPayload.userId;
    } else if (refreshPayload?.userId && refreshToken) {
      const user = await this.authService.getValidSessionUser(refreshPayload.userId, refreshToken);
      if (user) {
        await this.authService.clearRefreshToken(refreshPayload.userId);
        logoutUserId = refreshPayload.userId;
      }
    }

    if (logoutUserId) {
      await publishRealtimeEvent({
        type: "force_logout",
        userId: logoutUserId,
      }, undefined, this.realtimeChannel);
    }

    deleteCookie(c, "refreshToken", {
      path: "/",
    });

    return sendSuccess(c, "Logout successful");
  }

  async session(c: Context) {
    const accessToken = c.req.header("authorization")?.split(" ")[1];
    const refreshToken = getCookie(c, "refreshToken");

    if (!refreshToken) {
      return sendError(c, 403, "Session expired");
    }

    const refreshPayload = verifyRefreshToken(refreshToken);
    if (!refreshPayload) {
      return sendError(c, 403, "Session expired");
    }

    const user = await this.authService.getValidSessionUser(refreshPayload.userId, refreshToken);
    if (!user) {
      return sendError(c, 403, "Session expired");
    }

    const accessPayload = accessToken ? verifyAccessToken(accessToken) : null;
    if (accessPayload) {
      if (accessPayload.userId !== user.id) {
        return sendError(c, 403, "Session expired");
      }

      return sendSuccess(c, "Session valid", {
        accessToken,
      });
    }

    const newTokens = generateTokens(user.id, user.username, user.role, user.login);
    await this.authService.saveRefreshToken(user.id, newTokens.refreshToken);

    setCookie(c, "refreshToken", newTokens.refreshToken, this.getRefreshCookieOptions(c));

    return sendSuccess(c, "Session restored with new tokens", {
      accessToken: newTokens.accessToken,
    });
  }

  async updateUsername(c: Context) {
    const user = c.get("user");
    const body = await this.readJsonBody<Partial<{ username: string }>>(c);
    if (!body) {
      return sendError(c, 400, "Invalid username");
    }

    const validatedData = usernameSchema.safeParse(body);
    if (!validatedData.success) {
      return sendError(c, 400, this.getFirstValidationErrorMessage(validatedData, "Invalid username"));
    }

    const currentUser = await this.authService.getUserById(user.userId);
    if (!currentUser) {
      return sendError(c, 404, "User not found");
    }

    const normalizedUsername = validatedData.data.username.trim();
    if (currentUser.username === normalizedUsername) {
      return sendError(c, 409, "Username unchanged");
    }

    const updateResult = await this.authService.updateUsername(user.userId, normalizedUsername);

    if ("error" in updateResult) {
      return sendError(c, 409, updateResult.error);
    }

    const updatedUser = updateResult.user;
    if (!updatedUser) {
      return sendError(c, 500, "Failed to update username");
    }

    const newTokens = generateTokens(updatedUser.id, updatedUser.username, updatedUser.role, updatedUser.login);
    await this.authService.saveRefreshToken(updatedUser.id, newTokens.refreshToken);

    setCookie(c, "refreshToken", newTokens.refreshToken, this.getRefreshCookieOptions(c));

    return sendSuccess(c, "Username updated successfully", {
      accessToken: newTokens.accessToken,
      username: updatedUser.username,
    });
  }

  async getPublicKeys(c: Context) {
    const publicKeys = await this.authService.getAllPublicKeys();
    return sendSuccess(c, "Public keys retrieved", { publicKeys });
  }
}
