import { afterAll, beforeAll, beforeEach } from "bun:test";
import { createHttpApp } from "../../../src/bootstrap/app";
import { createServerDependencies } from "../../../src/bootstrap/dependencies";
import { createRealtimeServer } from "../../../src/bootstrap/realtime";
import type { ServerDependencies } from "../../../src/bootstrap/dependencies";
import type { Database, DatabaseClient } from "../../../src/db";
import { createTestDatabase } from "./testDatabase";

export interface TestApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface TestSession {
  accessToken: string;
  cookie: string;
}

export interface RegisteredUser extends TestSession {
  login: string;
  password: string;
  username: string;
}

export interface TestRuntimeContext {
  db: Database;
  client: DatabaseClient;
  dependencies: ServerDependencies;
  app: ReturnType<typeof createHttpApp>;
  runtime?: Awaited<ReturnType<typeof createRealtimeServer>>;
  origin: string;
  realtimeChannel: string;
}

interface SetupOptions {
  withRealtime?: boolean;
}

const DEFAULT_PUBLIC_KEY = "test-public-key";
const DEFAULT_PRIVATE_KEY = "test-encrypted-private-key";
const DEFAULT_PRIVATE_KEY_IV = "test-iv";
const DEFAULT_PRIVATE_KEY_SALT = "test-salt";

export const useTestRuntime = ({ withRealtime = false }: SetupOptions = {}) => {
  let runtimeContext: TestRuntimeContext;
  let cleanupDb: (() => Promise<void>) | undefined;
  let resetDb: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const testDatabase = await createTestDatabase();
    const dependencies = createServerDependencies(testDatabase.db);
    const realtimeChannel = `yourmsgr_events_${testDatabase.schemaName}`;
    const app = createHttpApp({ dependencies, realtimeChannel });
    const runtime = withRealtime
      ? await createRealtimeServer({ port: 0, dependencies, realtimeChannel })
      : undefined;
    const origin = runtime ? `http://127.0.0.1:${runtime.server.port}` : "http://localhost";

    runtimeContext = {
      db: testDatabase.db,
      client: testDatabase.client,
      dependencies,
      app,
      runtime,
      origin,
      realtimeChannel,
    };

    cleanupDb = async () => {
      await runtime?.stop?.();
      await testDatabase.cleanup();
    };

    resetDb = testDatabase.reset;
  });

  beforeEach(async () => {
    if (!resetDb) {
      throw new Error("Test runtime is not initialized");
    }

    await resetDb();
  });

  afterAll(async () => {
    await cleanupDb?.();
  });

  return () => runtimeContext;
};

export const extractCookie = (response: Response) => {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Expected Set-Cookie header");
  }

  return setCookie.split(";")[0];
};

export const requestJson = async <T = unknown>(
  app: ReturnType<typeof createHttpApp>,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: HeadersInit;
    cookie?: string;
    origin?: string;
  } = {},
) => {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  if (options.cookie) {
    headers.set("cookie", options.cookie);
  }

  const request = new Request(`${options.origin ?? "http://localhost"}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const response = await app.fetch(request);
  const data = await response.json() as TestApiResponse<T>;

  return { response, data };
};

export const fetchJson = async <T = unknown>(
  origin: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: HeadersInit;
    cookie?: string;
  } = {},
) => {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  if (options.cookie) {
    headers.set("cookie", options.cookie);
  }

  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json() as TestApiResponse<T>;

  return { response, data };
};

export const registerUser = async (
  app: ReturnType<typeof createHttpApp>,
  input: {
    login: string;
    password?: string;
    username?: string;
  },
) => {
  const password = input.password ?? "Audit1234";
  const username = input.username ?? input.login;
  const { response, data } = await requestJson<{ accessToken: string }>(app, "/auth/registration", {
    method: "POST",
    body: {
      login: input.login,
      password,
      username,
      publicKey: DEFAULT_PUBLIC_KEY,
      encryptedPrivateKey: DEFAULT_PRIVATE_KEY,
      encryptedPrivateKeyIv: DEFAULT_PRIVATE_KEY_IV,
      encryptedPrivateKeySalt: DEFAULT_PRIVATE_KEY_SALT,
    },
  });

  if (!response.ok || !data.data?.accessToken) {
    throw new Error(`Registration failed for ${input.login}`);
  }

  return {
    login: input.login,
    password,
    username,
    accessToken: data.data.accessToken,
    cookie: extractCookie(response),
  } satisfies RegisteredUser;
};

export const loginUser = async (
  origin: string,
  input: {
    login: string;
    password: string;
  },
) => {
  const { response, data } = await fetchJson<{
    accessToken: string;
    encryptedPrivateKey: string;
    encryptedPrivateKeyIv: string;
    encryptedPrivateKeySalt: string;
  }>(origin, "/auth/login", {
    method: "POST",
    body: {
      login: input.login,
      password: input.password,
    },
  });

  if (!response.ok || !data.data?.accessToken) {
    throw new Error(`Login failed for ${input.login}`);
  }

  return {
    accessToken: data.data.accessToken,
    cookie: extractCookie(response),
  } satisfies TestSession;
};
