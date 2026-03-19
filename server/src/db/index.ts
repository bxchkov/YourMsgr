import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type DatabaseClient = Sql<Record<string, unknown>>;

export const createDbClient = (connectionString = process.env.DATABASE_URL!) => {
  return postgres(connectionString);
};

export const createDatabase = (client: DatabaseClient): Database => {
  return drizzle(client, { schema });
};

const client = createDbClient();

export const dbClient = client;
export const db = createDatabase(client);
