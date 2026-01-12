import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { hashPassword, verifyPassword } from "../utils/password";
import { generateTokens } from "../utils/jwt";

export class AuthService {
  async register(login: string, password: string, username: string) {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.login, login.toLowerCase()),
    });

    if (existingUser) {
      return { error: "User already exists" };
    }

    const hashedPassword = await hashPassword(password);

    const [newUser] = await db
      .insert(users)
      .values({
        login: login.toLowerCase(),
        username,
        password: hashedPassword,
      })
      .returning();

    const tokens = generateTokens(newUser.id, newUser.username, newUser.role);
    await this.saveRefreshToken(newUser.id, tokens.refreshToken);

    return { user: newUser, tokens };
  }

  async login(login: string, password: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.login, login.toLowerCase()),
    });

    if (!user) {
      return { error: "Invalid credentials" };
    }

    const isValidPassword = await verifyPassword(user.password, password);

    if (!isValidPassword) {
      return { error: "Invalid credentials" };
    }

    const tokens = generateTokens(user.id, user.username, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { user, tokens };
  }

  async saveRefreshToken(userId: number, refreshToken: string) {
    await db
      .update(users)
      .set({ refreshToken })
      .where(eq(users.id, userId));
  }

  async clearRefreshToken(userId: number) {
    await db
      .update(users)
      .set({ refreshToken: null })
      .where(eq(users.id, userId));
  }

  async getUserById(userId: number) {
    return await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
  }
}
