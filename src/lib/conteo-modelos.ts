import { query } from "@/lib/db";

export interface ConteoModelo {
  /** Piezas etiquetadas (más/menos correcciones). */
  entradas: number;
  /** Piezas vendidas con la etiqueta de este modelo. */
  vendidas: number;
  /** Piezas que salieron sin ser venta (muestra, merma…) con la etiqueta de este modelo. */
  salidas: number;
  /** entradas − vendidas − salidas. */
  existencia: number;
}

/**
 * Conteo interno por modelo. Devuelve null si la base aún no tiene la tabla (migración 016 pendiente), para
 * que las pantallas sigan funcionando sin esa parte.
 */
export async function conteoPorModelo(modeloId?: number): Promise<Map<number, ConteoModelo> | null> {
  try {
    const { rows } = await query<{ modelo_id: number; entradas: string; vendidas: string; salidas: string }>(
      `WITH e AS (
         SELECT modelo_id, SUM(piezas) AS n FROM entradas_modelo
          WHERE ($1::int IS NULL OR modelo_id = $1) GROUP BY modelo_id
       ), m AS (
         SELECT modelo_id,
                -SUM(cantidad) FILTER (WHERE tipo = 'venta') AS vendidas,
                -SUM(cantidad) FILTER (WHERE tipo = 'salida') AS salidas
           FROM movimientos_inventario
          WHERE modelo_id IS NOT NULL AND ($1::int IS NULL OR modelo_id = $1)
          GROUP BY modelo_id
       )
       SELECT COALESCE(e.modelo_id, m.modelo_id) AS modelo_id,
              COALESCE(e.n, 0) AS entradas, COALESCE(m.vendidas, 0) AS vendidas, COALESCE(m.salidas, 0) AS salidas
         FROM e FULL JOIN m ON m.modelo_id = e.modelo_id`,
      [modeloId ?? null]
    );
    return new Map(
      rows.map((r) => {
        const entradas = Number(r.entradas);
        const vendidas = Number(r.vendidas);
        const salidas = Number(r.salidas);
        return [r.modelo_id, { entradas, vendidas, salidas, existencia: entradas - vendidas - salidas }];
      })
    );
  } catch (err) {
    // 42P01: falta la tabla (016); 42703: falta la columna modelo_id (015). Sin eso, no hay conteo.
    const code = (err as { code?: string }).code;
    if (code === "42P01" || code === "42703") return null;
    throw err;
  }
}
