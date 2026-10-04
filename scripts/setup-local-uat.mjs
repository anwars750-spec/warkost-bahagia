import path from "node:path";

const LOCAL_UAT_PASSWORD = "WarkostLocal#2026";

if (process.env.NODE_ENV === "production")
  throw Error("Local UAT fixture tidak boleh dijalankan di production");
if (process.env.DATABASE_URL)
  throw Error("Local UAT fixture hanya boleh memakai SQLite lokal");

const databasePath = path.resolve(
  process.env.DATABASE_PATH || "./data/warkost.db",
);
const relativeDatabasePath = path.relative(process.cwd(), databasePath);
if (
  relativeDatabasePath.startsWith("..") ||
  path.isAbsolute(relativeDatabasePath)
)
  throw Error("DATABASE_PATH local UAT harus berada di dalam folder project");

process.env.DATABASE_PATH = databasePath;
process.env.SEED_DEMO_PASSWORD = LOCAL_UAT_PASSWORD;
process.env.RESET_LOCAL_UAT_FIXTURE = "true";

await import("./seed.mjs");

console.log("Local UAT siap: customer@warkost.local");
console.log(`Password local-only: ${LOCAL_UAT_PASSWORD}`);
