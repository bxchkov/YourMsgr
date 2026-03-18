#!/usr/bin/env bun

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { desc, eq, or, sql } from "drizzle-orm";
import { db } from "../db";
import { messages, privateChats, users } from "../db/schema";
import { AuthService } from "../services/auth.service";
import { hashPassword } from "../utils/password";
import { loginSchema, usernameSchema } from "../utils/validation";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const authService = new AuthService();

const ROLE_MAP = {
  user: 1,
  admin: 3,
} as const;

type UserRole = (typeof ROLE_MAP)[keyof typeof ROLE_MAP];
type PreparedUserInput = {
  login: string;
  password: string;
  username: string;
  role: UserRole;
};

const help = () => {
  console.log(`
YourMsgr Admin CLI

Commands:
  stats
      Show key project stats

  health
      Check database availability and print summary

  users:list
      List all users

  users:get <login>
      Show detailed info about one user

  users:create [login] [password] [username] [--admin]
      Create a user interactively or from arguments

  users:create-admin [login] [password] [username]
      Create an admin user

  users:bootstrap-admin [login] [password] [username]
      Create the first admin only when there is no admin yet

  users:role <login> <user|admin>
      Change user role

  users:logout <login>
      Invalidate all sessions for a user

  users:delete <login> [--yes]
      Delete user with confirmation

  help
      Show this help
  `);
};

const warnDeprecated = (message: string) => {
  console.warn(`Deprecated: ${message}`);
};

const createPrompter = () => {
  const rl = createInterface({ input, output });

  return {
    ask: async (question: string) => (await rl.question(question)).trim(),
    close: () => rl.close(),
  };
};

const normalizeLogin = (value: string) => value.trim().toLowerCase();
const normalizeUsername = (value: string) => value.trim();

const parseRole = (value?: string | null): UserRole | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "1" || normalized === "user") {
    return ROLE_MAP.user;
  }

  if (normalized === "3" || normalized === "admin") {
    return ROLE_MAP.admin;
  }

  return null;
};

const generateTokenFriendlyValue = (length: number) =>
  randomBytes(length * 2)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, length);

const getUserByLogin = async (login: string) => {
  return db.query.users.findFirst({
    where: eq(users.login, normalizeLogin(login)),
  });
};

const validateUserInput = (login: string, password: string, username: string) => {
  const validatedLogin = loginSchema.safeParse({
    login,
    password,
  });

  if (!validatedLogin.success) {
    const issue = validatedLogin.error.issues[0];
    throw new Error(`Invalid login or password: ${issue?.message ?? "validation failed"}`);
  }

  const validatedUsername = usernameSchema.safeParse({
    username,
  });

  if (!validatedUsername.success) {
    const issue = validatedUsername.error.issues[0];
    throw new Error(`Invalid username: ${issue?.message ?? "validation failed"}`);
  }

  return {
    login: normalizeLogin(login),
    password,
    username: normalizeUsername(username),
  };
};

const ensureUniqueUser = async (login: string, username: string) => {
  const normalizedUsername = normalizeUsername(username);
  const normalizedLogin = normalizeLogin(login);

  const existingByLogin = await db.query.users.findFirst({
    where: eq(users.login, normalizedLogin),
    columns: {
      id: true,
    },
  });

  if (existingByLogin) {
    throw new Error(`User '${normalizedLogin}' already exists`);
  }

  const existingByUsername = await db.query.users.findFirst({
    where: or(
      eq(users.username, normalizedUsername),
      eq(users.login, normalizedUsername.toLowerCase())
    ),
    columns: {
      id: true,
    },
  });

  if (existingByUsername) {
    throw new Error(`Username '${normalizedUsername}' is already taken`);
  }
};

const getStatsMetrics = async () => {
  const [
    [{ usersCount }],
    [{ adminsCount }],
    [{ privateChatsCount }],
    [{ messagesCount }],
    [{ groupMessagesCount }],
    [{ privateMessagesCount }],
  ] = await Promise.all([
    db.select({ usersCount: sql<number>`count(*)` }).from(users),
    db.select({ adminsCount: sql<number>`count(*)` }).from(users).where(eq(users.role, ROLE_MAP.admin)),
    db.select({ privateChatsCount: sql<number>`count(*)` }).from(privateChats),
    db.select({ messagesCount: sql<number>`count(*)` }).from(messages),
    db.select({ groupMessagesCount: sql<number>`count(*)` }).from(messages).where(sql`${messages.chatType} = 'group' or ${messages.chatType} is null`),
    db.select({ privateMessagesCount: sql<number>`count(*)` }).from(messages).where(eq(messages.chatType, "private")),
  ]);

  return [
    { metric: "users_total", value: Number(usersCount) },
    { metric: "admins_total", value: Number(adminsCount) },
    { metric: "private_chats_total", value: Number(privateChatsCount) },
    { metric: "messages_total", value: Number(messagesCount) },
    { metric: "messages_group", value: Number(groupMessagesCount) },
    { metric: "messages_private", value: Number(privateMessagesCount) },
  ];
};

const countAdmins = async () => {
  const [{ adminsCount }] = await db
    .select({ adminsCount: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.role, ROLE_MAP.admin));

  return Number(adminsCount);
};

const showStats = async () => {
  console.table(await getStatsMetrics());
};

const showHealth = async () => {
  const startedAt = new Date().toISOString();
  const metrics = await getStatsMetrics();

  console.table([
    { check: "database", status: "ok", details: "query executed successfully" },
    { check: "checked_at", status: "ok", details: startedAt },
    ...metrics.map((item) => ({
      check: item.metric,
      status: "ok",
      details: String(item.value),
    })),
  ]);
};

const listUsers = async () => {
  const allUsers = await db.query.users.findMany({
    orderBy: [desc(users.createdAt)],
  });

  console.table(
    allUsers.map((user) => ({
      id: user.id,
      login: user.login,
      username: user.username,
      role: user.role === ROLE_MAP.admin ? "admin" : "user",
      hasSession: Boolean(user.refreshToken),
      createdAt: user.createdAt,
    }))
  );
};

const showUser = async (login: string) => {
  if (!login) {
    throw new Error("Usage: users:get <login>");
  }

  const user = await getUserByLogin(login);
  if (!user) {
    throw new Error(`User '${normalizeLogin(login)}' not found`);
  }

  console.table([
    {
      id: user.id,
      login: user.login,
      username: user.username,
      role: user.role === ROLE_MAP.admin ? "admin" : "user",
      hasSession: Boolean(user.refreshToken),
      hasPublicKey: Boolean(user.publicKey),
      createdAt: user.createdAt,
    },
  ]);
};

const prepareUserInput = async (
  inputArgs: string[],
  options: {
    forceAdmin?: boolean;
    defaultLoginPrefix?: string;
  } = {}
): Promise<PreparedUserInput> => {
  const adminFlagIndex = inputArgs.indexOf("--admin");
  const hasAdminFlag = adminFlagIndex !== -1 || options.forceAdmin === true;
  const positionalArgs = inputArgs.filter((value) => value !== "--admin");

  let login = positionalArgs[0] ?? "";
  let password = positionalArgs[1] ?? "";
  let username = positionalArgs[2] ?? "";

  if (!login || !password || !username) {
    const defaultLogin = `${options.defaultLoginPrefix ?? (hasAdminFlag ? "admin" : "user")}${generateTokenFriendlyValue(6).toLowerCase()}`;
    const defaultPassword = generateTokenFriendlyValue(14);
    const defaultUsername = login || defaultLogin;

    if (!input.isTTY || !output.isTTY) {
      login ||= defaultLogin;
      password ||= defaultPassword;
      username ||= defaultUsername;
    } else {
      const prompt = createPrompter();

      try {
        login = login || await prompt.ask(`Login (6-16 chars) [${defaultLogin}]: `) || defaultLogin;
        password = password || await prompt.ask(`Password (8-16 chars) [${defaultPassword}]: `) || defaultPassword;
        username = username || await prompt.ask(`Username (2-16 chars) [${defaultUsername}]: `) || defaultUsername;
      } finally {
        prompt.close();
      }
    }
  }

  const validated = validateUserInput(login, password, username);

  return {
    ...validated,
    role: hasAdminFlag ? ROLE_MAP.admin : ROLE_MAP.user,
  };
};

const persistUser = async (payload: PreparedUserInput) => {
  await ensureUniqueUser(payload.login, payload.username);

  const hashedPassword = await hashPassword(payload.password);

  await db.insert(users).values({
    login: payload.login,
    username: payload.username,
    password: hashedPassword,
    role: payload.role,
  });
};

const createUser = async (inputArgs: string[], forceAdmin = false) => {
  const prepared = await prepareUserInput(inputArgs, { forceAdmin });
  await persistUser(prepared);

  console.log(`Created ${prepared.role === ROLE_MAP.admin ? "admin" : "user"} '${prepared.login}'`);
};

const bootstrapAdmin = async (inputArgs: string[]) => {
  const adminCount = await countAdmins();
  if (adminCount > 0) {
    console.log("Admin bootstrap skipped: admin user already exists");
    return;
  }

  const prepared = await prepareUserInput(inputArgs, {
    forceAdmin: true,
    defaultLoginPrefix: "admin",
  });

  await persistUser(prepared);
  console.log(`Bootstrapped admin '${prepared.login}'`);
};

const changeRole = async (login: string, roleValue: string) => {
  if (!login || !roleValue) {
    throw new Error("Usage: users:role <login> <user|admin>");
  }

  const role = parseRole(roleValue);
  if (!role) {
    throw new Error("Role must be 'user' or 'admin'");
  }

  const user = await getUserByLogin(login);
  if (!user) {
    throw new Error(`User '${normalizeLogin(login)}' not found`);
  }

  await db.update(users).set({ role }).where(eq(users.id, user.id));
  console.log(`Changed role for '${user.login}' to ${role === ROLE_MAP.admin ? "admin" : "user"}`);
};

const logoutUser = async (login: string) => {
  if (!login) {
    throw new Error("Usage: users:logout <login>");
  }

  const user = await getUserByLogin(login);
  if (!user) {
    throw new Error(`User '${normalizeLogin(login)}' not found`);
  }

  await authService.clearRefreshToken(user.id);
  console.log(`Logged out '${user.login}' from all sessions`);
};

const deleteUser = async (login: string, skipConfirmation = false) => {
  if (!login) {
    throw new Error("Usage: users:delete <login> [--yes]");
  }

  const user = await getUserByLogin(login);
  if (!user) {
    throw new Error(`User '${normalizeLogin(login)}' not found`);
  }

  if (!skipConfirmation) {
    const prompt = createPrompter();

    try {
      const answer = await prompt.ask(`Delete user '${user.login}' and all related data? (yes/no): `);
      if (answer.toLowerCase() !== "yes") {
        console.log("Cancelled");
        return;
      }
    } finally {
      prompt.close();
    }
  }

  await db.delete(users).where(eq(users.id, user.id));
  console.log(`Deleted user '${user.login}'`);
};

const run = async () => {
  switch (command) {
    case "stats":
      await showStats();
      return;

    case "health":
      await showHealth();
      return;

    case "users:list":
      await listUsers();
      return;

    case "users:get":
      await showUser(args[1]);
      return;

    case "users:create":
      await createUser(args.slice(1));
      return;

    case "users:create-admin":
      await createUser(args.slice(1), true);
      return;

    case "users:bootstrap-admin":
      await bootstrapAdmin(args.slice(1));
      return;

    case "users:role":
      await changeRole(args[1], args[2]);
      return;

    case "users:logout":
      await logoutUser(args[1]);
      return;

    case "users:delete":
      await deleteUser(args[1], args.includes("--yes"));
      return;

    case "messages:count":
      warnDeprecated("Use 'stats' instead of 'messages:count'.");
      await showStats();
      return;

    case "messages:user":
      throw new Error("The 'messages:user' command was removed. Use database queries or build a proper moderation flow.");

    case "messages:clear":
      throw new Error("The 'messages:clear' command was removed for safety.");

    case "help":
    default:
      help();
  }
};

(async () => {
  try {
    await run();
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();
