#!/usr/bin/env bun

import "dotenv/config";
import { db } from "../db";
import { users, messages } from "../db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../utils/password";

const args = process.argv.slice(2);
const command = args[0];

const help = () => {
  console.log(`
.Chat Admin CLI

Commands:
  users:list              List all users
  users:create            Create new user (interactive)
  users:delete <login>    Delete user by login
  users:role <login> <role>  Change user role (1=user, 3=admin)

  messages:count          Show message count
  messages:clear          Clear all messages (with confirmation)
  messages:user <login>   Show messages from user

  help                    Show this help
  `);
};

const listUsers = async () => {
  const allUsers = await db.select().from(users);
  console.log("\nUsers:");
  console.table(
    allUsers.map((u) => ({
      id: u.id,
      login: u.login,
      username: u.username,
      role: u.role,
      created: u.createdAt,
    }))
  );
};

const createUser = async () => {
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (q: string): Promise<string> =>
    new Promise((resolve) => readline.question(q, resolve));

  try {
    const login = await question("Login (6-16 chars): ");
    const username = await question("Username (2-16 chars): ");
    const password = await question("Password (8-16 chars): ");
    const roleStr = await question("Role (1=user, 3=admin, default=1): ");
    const role = roleStr ? parseInt(roleStr) : 1;

    const hashedPassword = await hashPassword(password);

    await db.insert(users).values({
      login: login.toLowerCase(),
      username,
      password: hashedPassword,
      role,
    });

    console.log(`✓ User '${login}' created successfully`);
  } catch (error) {
    console.error("Error creating user:", error);
  } finally {
    readline.close();
  }
};

const deleteUser = async (login: string) => {
  if (!login) {
    console.error("Please provide login");
    return;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.login, login.toLowerCase()),
  });

  if (!user) {
    console.error(`User '${login}' not found`);
    return;
  }

  await db.delete(users).where(eq(users.id, user.id));
  console.log(`✓ User '${login}' deleted`);
};

const changeRole = async (login: string, roleStr: string) => {
  if (!login || !roleStr) {
    console.error("Usage: users:role <login> <role>");
    return;
  }

  const role = parseInt(roleStr);
  if (![1, 3].includes(role)) {
    console.error("Role must be 1 (user) or 3 (admin)");
    return;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.login, login.toLowerCase()),
  });

  if (!user) {
    console.error(`User '${login}' not found`);
    return;
  }

  await db.update(users).set({ role }).where(eq(users.id, user.id));
  console.log(`✓ User '${login}' role changed to ${role}`);
};

const messageCount = async () => {
  const allMessages = await db.select().from(messages);
  console.log(`Total messages: ${allMessages.length}`);
};

const clearMessages = async () => {
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (q: string): Promise<string> =>
    new Promise((resolve) => readline.question(q, resolve));

  try {
    const confirm = await question(
      "Are you sure you want to delete ALL messages? (yes/no): "
    );

    if (confirm.toLowerCase() === "yes") {
      await db.delete(messages);
      console.log("✓ All messages deleted");
    } else {
      console.log("Cancelled");
    }
  } finally {
    readline.close();
  }
};

const userMessages = async (login: string) => {
  if (!login) {
    console.error("Please provide login");
    return;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.login, login.toLowerCase()),
  });

  if (!user) {
    console.error(`User '${login}' not found`);
    return;
  }

  const userMsgs = await db.query.messages.findMany({
    where: eq(messages.userId, user.id),
  });

  console.log(`\nMessages from ${user.username}:`);
  console.table(
    userMsgs.map((m) => ({
      id: m.id,
      message: m.message.substring(0, 50),
      date: m.date,
    }))
  );
};

// Main
(async () => {
  try {
    switch (command) {
      case "users:list":
        await listUsers();
        break;
      case "users:create":
        await createUser();
        break;
      case "users:delete":
        await deleteUser(args[1]);
        break;
      case "users:role":
        await changeRole(args[1], args[2]);
        break;
      case "messages:count":
        await messageCount();
        break;
      case "messages:clear":
        await clearMessages();
        break;
      case "messages:user":
        await userMessages(args[1]);
        break;
      case "help":
      default:
        help();
        break;
    }
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
})();
