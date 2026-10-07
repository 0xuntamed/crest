// Applies db/migrations/*.sql in order, once each. Usage: npm run db:migrate
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

try {
  process.loadEnvFile?.(".env.local");
} catch {}
try {
  process.loadEnvFile?.(".env");
} catch {}

// Same names the app accepts (src/lib/db.ts).
const URL_VARS = ["DATABASE_URL", "POSTGRES_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"];
const url = URL_VARS.map((name) => process.env[name]).find(Boolean);
if (!url) {
  console.error(`No database configured: set DATABASE_URL (also accepted: ${URL_VARS.slice(1).join(", ")}).`);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined,
});
await client.connect();
await client.query(`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`);

const dir = path.join(process.cwd(), "db", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const { rows } = await client.query("select name from _migrations");
const done = new Set(rows.map((r) => r.name));

for (const file of files) {
  if (done.has(file)) continue;
  const sql = await readFile(path.join(dir, file), "utf8");
  process.stdout.write(`applying ${file} ... `);
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("insert into _migrations(name) values ($1)", [file]);
    await client.query("commit");
    console.log("ok");
  } catch (err) {
    await client.query("rollback");
    console.log("failed");
    console.error(err);
    process.exit(1);
  }
}
console.log("migrations up to date");
await client.end();
