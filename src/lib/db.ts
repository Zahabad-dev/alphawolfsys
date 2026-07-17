import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export function query<T extends object = object>(text: string, params?: unknown[]) {
  return getPool().query<T>(text, params);
}
