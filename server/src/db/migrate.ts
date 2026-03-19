import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { logger } from "../utils/logger";

const runMigrations = async () => {
  const connectionString = process.env.DATABASE_URL!;
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  logger.info("Running migrations");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  logger.info("Migrations completed");
  await sql.end();
};

runMigrations().catch((error) => {
  if (error?.code === "42P07" || (error?.message && error.message.includes("already exists"))) {
    logger.warn("Migration objects already exist, skipping. Server will start normally.");
    return;
  }

  logger.error("Migration failed", error);
  process.exit(1);
});
