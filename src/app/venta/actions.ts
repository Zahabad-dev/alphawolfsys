"use server";

import { auth } from "@/auth";
import { query, withTransaction } from "@/lib/db";
import { verificarUmbralYNotificar } from "@/lib/push";
import { esMotivoSalida, NOTA_SALIDA_MAX, type MotivoSalida } from "@/lib/motivos-salida";
import { SALIDAS_HABILITADAS } from "@/lib/funciones";
import { esTokenModelo } from "@/lib/modelos";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LoteRow {
  id: number;
  precio_mxn: string;
  sucursal_id: number;
  activo: boolean;
}

/**
 * Resuelve un QR escaneado al lote que realmente recibe la venta: el de la
 * sucursal del vendedor. La etiqueta física puede seguir siendo la de Almacén
 * (traspaso hecho sin reetiquetar por falta de tiempo); en ese caso la venta se
 * registra en el lote de la MISMA sucursal con el mismo precio (cada sucursal
 * tiene un lote por precio), así el stock cuadra sin depender de la etiqueta.
 */
async function resolverLotePropio(
  qrToken: string,
  sucursalId: number
): Promise<{ lote: LoteRow; modeloId: number | null } | { error: string }> {
  if (esTokenModelo(qrToken)) return resolverEtiquetaModelo(qrToken, sucursalId);
  // Las etiquetas de precio llevan un UUID; cualquier otra cosa no es una etiqueta del sistema.
  if (!UUID_RE.test(qrToken)) return { error: "Precio no encontrado o inactivo." };

  const { rows: loteRows } = await query<LoteRow>(
    "SELECT id, precio_mxn, sucursal_id, activo FROM lotes WHERE qr_token = $1",
    [qrToken]
  );
  const escaneado = loteRows[0];
  if (!escaneado || !escaneado.activo) {
    return { error: "Precio no encontrado o inactivo." };
  }
  if (escaneado.sucursal_id === sucursalId) return { lote: escaneado, modeloId: null };

  const { rows: propioRows } = await query<LoteRow>(
    "SELECT id, precio_mxn, sucursal_id, activo FROM lotes WHERE precio_mxn = $1 AND sucursal_id = $2",
    [escaneado.precio_mxn, sucursalId]
  );
  const propio = propioRows[0];
  if (!propio || !propio.activo) {
    return { error: "Este precio no está dado de alta en tu sucursal." };
  }
  return { lote: propio, modeloId: null };
}

/**
 * Etiqueta nueva (por modelo): se cobra el precio que ese modelo tiene en la sucursal de la vendedora, y la
 * pieza sale del lote de esa sucursal con ese mismo precio. Así el inventario y los cortes se cuentan igual
 * que con las etiquetas de precio; además queda anotado qué modelo se vendió.
 */
async function resolverEtiquetaModelo(
  qrToken: string,
  sucursalId: number
): Promise<{ lote: LoteRow; modeloId: number } | { error: string }> {
  let rows: (Partial<LoteRow> & { modelo_id: number; precio_modelo: string | null })[];
  try {
    ({ rows } = await query(
      `SELECT m.id AS modelo_id, pm.precio_mxn AS precio_modelo,
              l.id, l.precio_mxn, l.sucursal_id, l.activo
         FROM modelos m
         LEFT JOIN LATERAL (
             SELECT pm.precio_mxn FROM precios_modelo pm JOIN sucursales s ON s.id = pm.sucursal_id
              WHERE pm.modelo_id = m.id AND pm.vigente_hasta IS NULL AND (pm.sucursal_id = $2 OR s.tipo = 'almacen')
              ORDER BY (pm.sucursal_id = $2) DESC LIMIT 1
         ) pm ON true
         LEFT JOIN lotes l
                ON l.sucursal_id = $2 AND l.precio_mxn = pm.precio_mxn AND l.activo
        WHERE m.qr_token = $1
        ORDER BY l.id
        LIMIT 1`,
      [qrToken, sucursalId]
    ));
  } catch (err) {
    // 42P01: esta base todavía no tiene las tablas de modelos.
    if ((err as { code?: string }).code === "42P01") return { error: "Etiqueta no encontrada." };
    throw err;
  }
  const r = rows[0];
  if (!r) return { error: "Etiqueta no encontrada." };
  if (r.precio_modelo === null) return { error: "Este modelo todavía no tiene precio. Avisa a la administración." };
  if (!r.id) {
    return {
      error: `El precio de este modelo ($${Number(r.precio_modelo).toFixed(2)}) no está dado de alta en tu sucursal. Avisa a la administración.`,
    };
  }
  return {
    lote: { id: r.id, precio_mxn: r.precio_mxn!, sucursal_id: r.sucursal_id!, activo: true },
    modeloId: r.modelo_id,
  };
}

/** Columnas extra cuando la pieza se cobró con etiqueta de modelo (solo entonces se escribe modelo_id). */
function conModelo(modeloId: number | null) {
  // El id sale de la base (modelos.id), nunca de lo que manda el celular; aun así se valida como entero.
  if (modeloId === null) return { col: "", val: "" };
  if (!Number.isSafeInteger(modeloId) || modeloId <= 0) throw new Error("modelo_id inválido");
  return { col: ", modelo_id", val: `, ${modeloId}` };
}

export interface RegistrarVentaResult {
  error?: string;
  success?: { cantidad: number; total: number };
}

/**
 * Registra la venta completa como UN solo movimiento (cantidad = -N), contada
 * en pantalla al re-escanear el mismo QR pero sin escribir nada hasta
 * confirmar — así nunca queda stock descontado por una venta abandonada a
 * medias.
 */
export async function registrarVentaAction(input: {
  qrToken: string;
  cantidad: number;
  idempotencyKey: string;
}): Promise<RegistrarVentaResult> {
  const session = await auth();
  const user = session?.user;
  if (!user || user.rol !== "vendedor" || !user.sucursalId) {
    return { error: "No autorizado." };
  }

  if (!Number.isInteger(input.cantidad) || input.cantidad <= 0) {
    return { error: "La cantidad debe ser un número entero mayor a 0." };
  }

  const resuelto = await resolverLotePropio(input.qrToken, user.sucursalId);
  if ("error" in resuelto) return { error: resuelto.error };
  const lote = resuelto.lote;
  const mod = conModelo(resuelto.modeloId);

  const precio = Number(lote.precio_mxn);

  let stockAntes: number;
  try {
    // Se bloquea el lote: dos ventas a la vez del mismo precio se turnan y el stock no queda negativo.
    const r = await withTransaction<{ error: string } | { stockAntes: number }>(async (client) => {
      await client.query("SELECT id FROM lotes WHERE id = $1 FOR UPDATE", [lote.id]);
      const { rows: stockRows } = await client.query<{ stock: string }>(
        "SELECT stock FROM stock_actual WHERE lote_id = $1",
        [lote.id]
      );
      const antes = Number(stockRows[0]?.stock ?? 0);
      if (input.cantidad > antes) return { error: `Stock insuficiente: quedan ${antes} piezas.` };
      await client.query(
        `INSERT INTO movimientos_inventario
           (lote_id, sucursal_id, tipo, cantidad, usuario_id, precio_unitario_mxn, idempotency_key${mod.col})
         VALUES ($1, $2, 'venta', $3, $4, $5, $6${mod.val})`,
        [lote.id, lote.sucursal_id, -input.cantidad, Number(user.id), precio, input.idempotencyKey]
      );
      return { stockAntes: antes };
    });
    if ("error" in r) return { error: r.error };
    stockAntes = r.stockAntes;
  } catch (err) {
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      // Reenvío duplicado (mismo idempotency_key): ya se registró, no es un error.
      return { success: { cantidad: input.cantidad, total: input.cantidad * precio } };
    }
    throw err;
  }

  try {
    await verificarUmbralYNotificar(lote.id, stockAntes, stockAntes - input.cantidad);
  } catch {
    // La venta ya está confirmada: un fallo al avisar (push) no la tumba.
  }

  return { success: { cantidad: input.cantidad, total: input.cantidad * precio } };
}

export interface RegistrarCarritoResult {
  error?: string;
  success?: { piezas: number; total: number };
}

const MAX_LINEAS = 50;
const MAX_PIEZAS_LINEA = 100000;

/**
 * Registra una venta de VARIOS precios (carrito) en una sola transacción:
 * o se registran todas las líneas o ninguna, nunca una venta a medias. Cada
 * línea queda como su propio movimiento (así dashboard, ranking e historial
 * siguen igual) y todas comparten venta_id.
 *
 * Es idempotente por venta_id: si el celular reintenta una venta que sí había
 * llegado (se cortó la respuesta, o se sincroniza desde la cola offline), no
 * se duplica nada y se responde éxito.
 */
export async function registrarVentaCarritoAction(input: {
  ventaId: string;
  lineas: { qrToken: string; cantidad: number; idempotencyKey: string }[];
}): Promise<RegistrarCarritoResult> {
  const session = await auth();
  const user = session?.user;
  if (!user || user.rol !== "vendedor" || !user.sucursalId) {
    return { error: "No autorizado." };
  }
  const sucursalId = user.sucursalId;

  if (typeof input.ventaId !== "string" || !UUID_RE.test(input.ventaId)) {
    return { error: "Venta inválida." };
  }
  if (!Array.isArray(input.lineas) || input.lineas.length === 0) {
    return { error: "La venta no tiene piezas." };
  }
  if (input.lineas.length > MAX_LINEAS) {
    return { error: `Una venta no puede llevar más de ${MAX_LINEAS} precios distintos.` };
  }
  for (const l of input.lineas) {
    if (
      typeof l.qrToken !== "string" ||
      typeof l.idempotencyKey !== "string" ||
      !UUID_RE.test(l.idempotencyKey) ||
      !Number.isInteger(l.cantidad) ||
      l.cantidad <= 0 ||
      l.cantidad > MAX_PIEZAS_LINEA
    ) {
      return { error: "Hay una línea inválida en la venta." };
    }
  }

  // Cada QR → lote de la sucursal del vendedor; líneas que caen en el mismo lote (y mismo modelo) se suman.
  const porLote = new Map<string, { lote: LoteRow; modeloId: number | null; cantidad: number; idempotencyKey: string }>();
  for (const l of input.lineas) {
    const resuelto = await resolverLotePropio(l.qrToken, sucursalId);
    if ("error" in resuelto) return { error: resuelto.error };
    const clave = `${resuelto.lote.id}|${resuelto.modeloId ?? ""}`;
    const previo = porLote.get(clave);
    if (previo) previo.cantidad += l.cantidad;
    else {
      porLote.set(clave, {
        lote: resuelto.lote,
        modeloId: resuelto.modeloId,
        cantidad: l.cantidad,
        idempotencyKey: l.idempotencyKey,
      });
    }
  }
  const lineas = [...porLote.values()].sort((a, b) => a.lote.id - b.lote.id);
  // Piezas por lote (varias líneas de modelos distintos pueden salir del mismo lote).
  const piezasPorLote = new Map<number, { lote: LoteRow; cantidad: number }>();
  for (const l of lineas) {
    const p = piezasPorLote.get(l.lote.id);
    if (p) p.cantidad += l.cantidad;
    else piezasPorLote.set(l.lote.id, { lote: l.lote, cantidad: l.cantidad });
  }
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);
  const total = lineas.reduce((s, l) => s + l.cantidad * Number(l.lote.precio_mxn), 0);

  type Resultado = { error: string } | { stocks: { loteId: number; antes: number; despues: number }[] } | "duplicada";

  let resultado: Resultado;
  try {
    resultado = await withTransaction<Resultado>(async (client) => {
      // Bloquea los lotes (en orden de id, sin deadlocks): dos ventas simultáneas del
      // mismo precio se turnan, así el stock no puede quedar negativo por una carrera.
      await client.query("SELECT id FROM lotes WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE", [
        [...piezasPorLote.keys()],
      ]);

      const { rows: yaRegistrada } = await client.query(
        "SELECT 1 FROM movimientos_inventario WHERE venta_id = $1 LIMIT 1",
        [input.ventaId]
      );
      if (yaRegistrada.length > 0) return "duplicada";

      const stocks: { loteId: number; antes: number; despues: number }[] = [];
      for (const l of piezasPorLote.values()) {
        const { rows } = await client.query<{ stock: string }>(
          "SELECT stock FROM stock_actual WHERE lote_id = $1",
          [l.lote.id]
        );
        const antes = Number(rows[0]?.stock ?? 0);
        if (l.cantidad > antes) {
          return {
            error: `Stock insuficiente en $${Number(l.lote.precio_mxn).toFixed(2)}: quedan ${antes} piezas y quieres vender ${l.cantidad}. No se registró nada de la venta.`,
          };
        }
        stocks.push({ loteId: l.lote.id, antes, despues: antes - l.cantidad });
      }

      for (const l of lineas) {
        const mod = conModelo(l.modeloId);
        await client.query(
          `INSERT INTO movimientos_inventario
             (lote_id, sucursal_id, tipo, cantidad, usuario_id, precio_unitario_mxn, idempotency_key, venta_id${mod.col})
           VALUES ($1, $2, 'venta', $3, $4, $5, $6, $7${mod.val})`,
          [
            l.lote.id,
            l.lote.sucursal_id,
            -l.cantidad,
            Number(user.id),
            Number(l.lote.precio_mxn),
            l.idempotencyKey,
            input.ventaId,
          ]
        );
      }
      return { stocks };
    });
  } catch (err) {
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      // Misma línea registrada en paralelo por un reintento: ya está, no es un error.
      return { success: { piezas, total } };
    }
    throw err;
  }

  if (resultado === "duplicada") return { success: { piezas, total } };
  if ("error" in resultado) return { error: resultado.error };

  // La venta ya está confirmada: un fallo al avisar (push) no debe tumbarla.
  for (const s of resultado.stocks) {
    try {
      await verificarUmbralYNotificar(s.loteId, s.antes, s.despues);
    } catch {
      // se ignora a propósito
    }
  }

  return { success: { piezas, total } };
}

export interface RegistrarSalidaResult {
  error?: string;
  success?: { cantidad: number; motivo: MotivoSalida; precio: number };
}

/**
 * Registra una SALIDA que no es venta (muestra, saldo, merma, otro): la
 * prenda sale del inventario de la sucursal del vendedor con su motivo, para que
 * no siga contando como existencia. Mismo cuidado que la venta: bloquea el lote
 * (sin stock negativo por carrera), es idempotente por idempotency_key y acepta
 * la etiqueta de otra sucursal con el mismo precio.
 */
export async function registrarSalidaAction(input: {
  qrToken: string;
  cantidad: number;
  motivo: string;
  nota?: string;
  idempotencyKey: string;
}): Promise<RegistrarSalidaResult> {
  if (!SALIDAS_HABILITADAS) {
    return { error: "Las salidas están deshabilitadas por el momento." };
  }

  const session = await auth();
  const user = session?.user;
  if (!user || user.rol !== "vendedor" || !user.sucursalId) {
    return { error: "No autorizado." };
  }

  if (!Number.isInteger(input.cantidad) || input.cantidad <= 0 || input.cantidad > MAX_PIEZAS_LINEA) {
    return { error: "La cantidad debe ser un número entero mayor a 0." };
  }
  if (!esMotivoSalida(input.motivo)) {
    return { error: "Elige el motivo de la salida." };
  }
  if (typeof input.idempotencyKey !== "string" || !UUID_RE.test(input.idempotencyKey)) {
    return { error: "Salida inválida." };
  }
  const nota = (input.nota ?? "").trim().slice(0, NOTA_SALIDA_MAX);
  if (input.motivo === "otro" && !nota) {
    return { error: "Escribe cuál es el motivo." };
  }

  const resuelto = await resolverLotePropio(input.qrToken, user.sucursalId);
  if ("error" in resuelto) return { error: resuelto.error };
  const lote = resuelto.lote;
  const mod = conModelo(resuelto.modeloId);
  const precio = Number(lote.precio_mxn);
  const motivo = input.motivo;

  const resultado = await withTransaction<
    { error: string } | { stockAntes: number } | "duplicada"
  >(async (client) => {
    await client.query("SELECT id FROM lotes WHERE id = $1 FOR UPDATE", [lote.id]);

    const { rows: yaRegistrada } = await client.query(
      "SELECT 1 FROM movimientos_inventario WHERE idempotency_key = $1 LIMIT 1",
      [input.idempotencyKey]
    );
    if (yaRegistrada.length > 0) return "duplicada";

    const { rows } = await client.query<{ stock: string }>(
      "SELECT stock FROM stock_actual WHERE lote_id = $1",
      [lote.id]
    );
    const stockAntes = Number(rows[0]?.stock ?? 0);
    if (input.cantidad > stockAntes) {
      return { error: `Stock insuficiente: quedan ${stockAntes} piezas.` };
    }

    await client.query(
      `INSERT INTO movimientos_inventario
         (lote_id, sucursal_id, tipo, cantidad, usuario_id, precio_unitario_mxn, nota, idempotency_key, motivo${mod.col})
       VALUES ($1, $2, 'salida', $3, $4, $5, $6, $7, $8${mod.val})`,
      [
        lote.id,
        lote.sucursal_id,
        -input.cantidad,
        Number(user.id),
        precio,
        nota || null,
        input.idempotencyKey,
        motivo,
      ]
    );
    return { stockAntes };
  });

  if (resultado === "duplicada") return { success: { cantidad: input.cantidad, motivo, precio } };
  if ("error" in resultado) return { error: resultado.error };

  try {
    await verificarUmbralYNotificar(lote.id, resultado.stockAntes, resultado.stockAntes - input.cantidad);
  } catch {
    // La salida ya está confirmada: un fallo al avisar (push) no la tumba.
  }

  return { success: { cantidad: input.cantidad, motivo, precio } };
}

/**
 * Una venta guardada offline (celular sin señal) que al sincronizar fue
 * rechazada por el servidor (ej. ya no hay stock, precio desactivado) no se
 * puede reintentar sola — se reporta a la bandeja de soporte para que un
 * admin decida qué hacer, en vez de perderse en silencio.
 */
export async function reportarVentaOfflineFallidaAction(input: {
  qrToken: string;
  cantidad: number;
  mensaje: string;
  /** Venta con varios precios: detalle de cada línea (qrToken, cantidad, precio). */
  lineas?: { qrToken: string; cantidad: number; precio: number }[];
}) {
  const session = await auth();
  const user = session?.user;
  if (!user || user.rol !== "vendedor") return;

  await query(
    `INSERT INTO errores_soporte (origen, workflow, mensaje, detalle)
     VALUES ($1, $2, $3, $4)`,
    [
      "app:venta-offline",
      user.sucursalId ? `sucursal-${user.sucursalId}` : null,
      `No se pudo sincronizar una venta guardada sin conexión: ${input.mensaje}`,
      JSON.stringify({
        qrToken: input.qrToken,
        cantidad: input.cantidad,
        lineas: input.lineas,
        vendedor: user.name,
      }),
    ]
  );
}
