import "server-only";
import { Pool, type PoolClient } from "pg";

// Hosting integrations name the connection string differently (Vercel + Neon/Supabase often add POSTGRES_URL).
const URL_VARS = ["DATABASE_URL", "POSTGRES_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"] as const;

export function databaseUrl(): string | undefined {
  for (const name of URL_VARS) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

const globalForPool = globalThis as unknown as { __crestPool?: Pool };

// Created on first use, so builds without a database still work and a missing URL fails with a clear message
// instead of pg silently falling back to localhost:5432.
function getPool(): Pool {
  if (globalForPool.__crestPool) return globalForPool.__crestPool;
  const connectionString = databaseUrl();
  if (!connectionString)
    throw new Error(`No database configured: set DATABASE_URL (also accepted: ${URL_VARS.slice(1).join(", ")}).`);
  globalForPool.__crestPool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined,
  });
  return globalForPool.__crestPool;
}

export const pool = {
  query: ((...args: unknown[]) => (getPool().query as (...a: unknown[]) => unknown)(...args)) as Pool["query"],
  connect: (): Promise<PoolClient> => getPool().connect(),
};

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (err) {
    await c.query("rollback").catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}
