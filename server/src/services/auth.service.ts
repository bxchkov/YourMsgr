import { and, eq, ne, or } from "drizzle-orm";
import { db, type Database } from "../db";
import { users } from "../db/schema";
import { hashPassword, verifyPassword } from "../utils/password";
import { generateTokens } from "../utils/jwt";
import { isReservedIdentity } from "../utils/identity";
import { hashRefreshToken, verifyRefreshTokenHash } from "../utils/refreshToken";

export class AuthService {
  constructor(private readonly database: Database = db) {}

  private async findUsernameConflict(userId: number | null, username: string) {
    const normalizedUsername = username.trim();

    return this.database.query.users.findFirst({
      where: userId
        ? and(
            ne(users.id, userId),
            or(
              eq(users.username, normalizedUsername),
              eq(users.login, normalizedUsername.toLowerCase())
            )
          )
        : or(
            eq(users.username, normalizedUsername),
            eq(users.login, normalizedUsername.toLowerCase())
          ),
      columns: {
        id: true,
        login: true,
        username: true,
      },
    });
  }

  async register(
    login: string,
    password: string,
    username: string,
    publicKey: string,
    encryptedPrivateKey: string,
    encryptedPrivateKeyIv: string,
    encryptedPrivateKeySalt: string
  ) {
    if (isReservedIdentity(login)) {
      return { error: "Reserved login" as const };
    }

    if (isReservedIdentity(username)) {
      return { error: "Reserved username" as const };
    }

    const existingUser = await this.database.query.users.findFirst({
      where: eq(users.login, login.toLowerCase()),
    });

    if (existingUser) {
      return { error: "User already exists" };
    }

    const usernameConflict = await this.findUsernameConflict(null, username);
    if (usernameConflict) {
      return { error: "Username already taken" };
    }

    const hashedPassword = await hashPassword(password);

    const [newUser] = await this.database
      .insert(users)
      .values({
        login: login.toLowerCase(),
        username,
        password: hashedPassword,
        publicKey,
        encryptedPrivateKey,
        encryptedPrivateKeyIv,
        encryptedPrivateKeySalt,
      })
      .returning();

    const tokens = generateTokens(newUser.id, newUser.username, newUser.role, newUser.login);
    await this.saveRefreshToken(newUser.id, tokens.refreshToken);

    return { user: newUser, tokens };
  }

  async login(login: string, password: string) {
    const user = await this.database.query.users.findFirst({
      where: eq(users.login, login.toLowerCase()),
    });

    if (!user) {
      return { error: "Invalid credentials" };
    }

    const isValidPassword = await verifyPassword(user.password, password);

    if (!isValidPassword) {
      return { error: "Invalid credentials" };
    }

    const tokens = generateTokens(user.id, user.username, user.role, user.login);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    // Return encrypted private key data for client to decrypt
    return {
      user,
      tokens,
      encryptedPrivateKey: user.encryptedPrivateKey,
      encryptedPrivateKeyIv: user.encryptedPrivateKeyIv,
      encryptedPrivateKeySalt: user.encryptedPrivateKeySalt,
    };
  }

  async saveRefreshToken(userId: number, refreshToken: string) {
    await this.database
      .update(users)
      .set({ refreshToken: hashRefreshToken(refreshToken) })
      .where(eq(users.id, userId));
  }

  async clearRefreshToken(userId: number) {
    await this.database
      .update(users)
      .set({ refreshToken: null })
      .where(eq(users.id, userId));
  }

  async getUserById(userId: number) {
    return await this.database.query.users.findFirst({
      where: eq(users.id, userId),
    });
  }

  async getValidSessionUser(userId: number, refreshToken: string) {
    const user = await this.getUserById(userId);

    if (!user || !verifyRefreshTokenHash(refreshToken, user.refreshToken)) {
      return null;
    }

    return user;
  }

  async updateUsername(userId: number, newUsername: string) {
    const normalizedUsername = newUsername.trim();

    if (isReservedIdentity(normalizedUsername)) {
      return { error: "Reserved username" as const };
    }

    const existingUser = await this.findUsernameConflict(userId, normalizedUsername);

    if (existingUser) {
      return { error: "Username already taken" as const };
    }

    const [updatedUser] = await this.database
      .update(users)
      .set({ username: normalizedUsername })
      .where(eq(users.id, userId))
      .returning();

    return { user: updatedUser };
  }
  async getAllPublicKeys() {
    const allUsers = await this.database.query.users.findMany({
      columns: {
        id: true,
        username: true,
        publicKey: true,
      },
    });

    return allUsers.filter(user => user.publicKey).map(user => ({
      userId: user.id,
      username: user.username,
      publicKey: user.publicKey,
    }));
  }
}
