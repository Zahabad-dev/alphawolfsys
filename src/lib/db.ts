import { Pool, type PoolClient } from "pg";
import { ZONA_HORARIA } from "@/lib/fechas";

let pool: Pool | undefined;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // La sesión trabaja en hora de México: así "hoy", la semana, el mes, las horas
      // que formatea SQL y los filtros por fecha cuentan el día de México, no el de UTC.
      options: `-c timezone=${ZONA_HORARIA}`,
    });
  }
  return pool;
}

export function query<T extends object = object>(text: string, params?: unknown[]) {
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
