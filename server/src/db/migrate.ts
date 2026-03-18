import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const runMigrations = async () => {
  const connectionString = process.env.DATABASE_URL!;
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("Migrations completed!");
  await sql.end();
};

runMigrations().catch((err) => {
  // PostgreSQL error 42P07 = "relation already exists" — safe to ignore on re-runs
  if (err?.code === "42P07" || (err?.message && err.message.includes("already exists"))) {
    console.log("Migrations: objects already exist, skipping. Server will start normally.");
  } else {
    console.error("Migration failed:", err);
    process.exit(1);
  }
});
