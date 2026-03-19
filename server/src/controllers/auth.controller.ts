import { Context } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { AuthService } from "../services/auth.service";
import { encryptedPrivateKeySchema, loginSchema, registrationSchema, usernameSchema } from "../utils/validation";
import { sendSuccess, sendError } from "../utils/response";
import { verifyAccessToken, verifyRefreshToken, generateTokens } from "../utils/jwt";

const authService = new AuthService();

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
  private getFirstValidationErrorMessage(result: { error?: { issues?: Array<{ message?: string }> } }, fallback: string) {
    return result.error?.issues?.[0]?.message || fallback;
  }

  private isFilledString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
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

  private parseLegacyRegistrationCredentials(authHeader?: string): RegistrationCredentials | null {
    if (!authHeader) {
      return null;
    }

    const [login, password, encodedUsername, publicKey, encryptedPrivateKey, encryptedPrivateKeyIv, encryptedPrivateKeySalt] = authHeader.split(":");
    if (
      !this.isFilledString(login) ||
      !this.isFilledString(password) ||
      !this.isFilledString(encodedUsername) ||
      !this.isFilledString(publicKey) ||
      !this.isFilledString(encryptedPrivateKey) ||
      !this.isFilledString(encryptedPrivateKeyIv) ||
      !this.isFilledString(encryptedPrivateKeySalt)
    ) {
      return null;
    }

    return {
      login,
      password,
      username: decodeURIComponent(encodedUsername),
      publicKey,
      encryptedPrivateKey,
      encryptedPrivateKeyIv,
      encryptedPrivateKeySalt,
    };
  }

  private parseLegacyLoginCredentials(authHeader?: string): LoginCredentials | null {
    if (!authHeader) {
      return null;
    }

    const [login, password] = authHeader.split(":");
    if (!this.isFilledString(login) || !this.isFilledString(password)) {
      return null;
    }

    return { login, password };
  }

  private async getRegistrationCredentials(c: Context): Promise<RegistrationCredentials | null> {
    const body = await this.readJsonBody<Partial<RegistrationCredentials>>(c);
    if (
      body &&
      this.isFilledString(body.login) &&
      this.isFilledString(body.password) &&
      this.isFilledString(body.username) &&
      this.isFilledString(body.publicKey) &&
      this.isFilledString(body.encryptedPrivateKey) &&
      this.isFilledString(body.encryptedPrivateKeyIv) &&
      this.isFilledString(body.encryptedPrivateKeySalt)
    ) {
      return {
        login: body.login,
        password: body.password,
        username: body.username,
        publicKey: body.publicKey,
        encryptedPrivateKey: body.encryptedPrivateKey,
        encryptedPrivateKeyIv: body.encryptedPrivateKeyIv,
        encryptedPrivateKeySalt: body.encryptedPrivateKeySalt,
      };
    }

    return this.parseLegacyRegistrationCredentials(c.req.header("authorization"));
  }

  private async getLoginCredentials(c: Context): Promise<LoginCredentials | null> {
    const body = await this.readJsonBody<Partial<LoginCredentials>>(c);
    if (body && this.isFilledString(body.login) && this.isFilledString(body.password)) {
      return {
        login: body.login,
        password: body.password,
      };
    }

    return this.parseLegacyLoginCredentials(c.req.header("authorization"));
  }

  async register(c: Context) {
    const credentials = await this.getRegistrationCredentials(c);
    if (!credentials) {
      return sendError(c, 400, "Missing credentials");
    }

    const validatedData = registrationSchema.safeParse(credentials);
    if (!validatedData.success) {
      return sendError(c, 400, this.getFirstValidationErrorMessage(validatedData, "Invalid input data"));
    }

    const result = await authService.register(
      credentials.login,
      credentials.password,
      credentials.username,
      credentials.publicKey,
      credentials.encryptedPrivateKey,
      credentials.encryptedPrivateKeyIv,
      credentials.encryptedPrivateKeySalt
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
    const credentials = await this.getLoginCredentials(c);
    if (!credentials) {
      return sendError(c, 400, "Missing credentials");
    }

    const validatedData = loginSchema.safeParse(credentials);
    if (!validatedData.success) {
      return sendError(c, 400, this.getFirstValidationErrorMessage(validatedData, "Invalid input data"));
    }

    const result = await authService.login(credentials.login, credentials.password);

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

    const user = await authService.getUserById(refreshPayload.userId);
    if (!user || user.refreshToken !== refreshToken) {
      return sendError(c, 403, "Token mismatch");
    }

    const accessPayload = accessToken ? verifyAccessToken(accessToken) : null;
    if (accessPayload && accessPayload.userId !== user.id) {
      return sendError(c, 403, "Token mismatch");
    }

    const newTokens = generateTokens(user.id, user.username, user.role, user.login);
    await authService.saveRefreshToken(user.id, newTokens.refreshToken);

    setCookie(c, "refreshToken", newTokens.refreshToken, this.getRefreshCookieOptions(c));

    return sendSuccess(c, "Tokens refreshed", {
      accessToken: newTokens.accessToken,
    });
  }

  async logout(c: Context) {
    const accessToken = c.req.header("authorization")?.split(" ")[1];
    const refreshToken = getCookie(c, "refreshToken");

    const accessPayload = accessToken ? verifyAccessToken(accessToken) : null;
    const refreshPayload = refreshToken ? verifyRefreshToken(refreshToken) : null;

    if (accessPayload?.userId) {
      await authService.clearRefreshToken(accessPayload.userId);
    } else if (refreshPayload?.userId && refreshToken) {
      const user = await authService.getUserById(refreshPayload.userId);
      if (user?.refreshToken === refreshToken) {
        await authService.clearRefreshToken(refreshPayload.userId);
      }
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

    const user = await authService.getValidSessionUser(refreshPayload.userId, refreshToken);
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
    await authService.saveRefreshToken(user.id, newTokens.refreshToken);

    setCookie(c, "refreshToken", newTokens.refreshToken, this.getRefreshCookieOptions(c));

    return sendSuccess(c, "Session restored with new tokens", {
      accessToken: newTokens.accessToken,
    });
  }

  async updateUsername(c: Context) {
    const user = c.get("user");
    const body = await c.req.json();

    const validatedData = usernameSchema.safeParse(body);
    if (!validatedData.success) {
      return sendError(c, 400, this.getFirstValidationErrorMessage(validatedData, "Invalid username"));
    }

    const currentUser = await authService.getUserById(user.userId);
    if (!currentUser) {
      return sendError(c, 404, "User not found");
    }

    const normalizedUsername = validatedData.data.username.trim();
    if (currentUser.username === normalizedUsername) {
      return sendError(c, 409, "Username unchanged");
    }

    const updateResult = await authService.updateUsername(user.userId, normalizedUsername);

    if ("error" in updateResult) {
      return sendError(c, 409, updateResult.error);
    }

    const updatedUser = updateResult.user;
    if (!updatedUser) {
      return sendError(c, 500, "Failed to update username");
    }

    const newTokens = generateTokens(updatedUser.id, updatedUser.username, updatedUser.role, updatedUser.login);
    await authService.saveRefreshToken(updatedUser.id, newTokens.refreshToken);

    setCookie(c, "refreshToken", newTokens.refreshToken, this.getRefreshCookieOptions(c));

    return sendSuccess(c, "Username updated successfully", {
      accessToken: newTokens.accessToken,
      username: updatedUser.username,
    });
  }

  async getPublicKeys(c: Context) {
    const publicKeys = await authService.getAllPublicKeys();
    return sendSuccess(c, "Public keys retrieved", { publicKeys });
  }

  async updateEncryptedPrivateKey(c: Context) {
    const user = c.get("user");
    const body = await c.req.json();

    const validatedData = encryptedPrivateKeySchema.safeParse(body);
    if (!validatedData.success) {
      return sendError(c, 400, this.getFirstValidationErrorMessage(validatedData, "Invalid encrypted private key payload"));
    }

    const updatedUser = await authService.updateEncryptedPrivateKey(
      user.userId,
      validatedData.data.encryptedPrivateKey,
      validatedData.data.encryptedPrivateKeyIv,
      validatedData.data.encryptedPrivateKeySalt,
    );

    if (!updatedUser) {
      return sendError(c, 404, "User not found");
    }

    return sendSuccess(c, "Encrypted private key updated");
  }
}
