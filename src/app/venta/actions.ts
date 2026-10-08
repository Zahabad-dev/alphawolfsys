"use server";

import { auth } from "@/auth";
import { query, withTransaction } from "@/lib/db";
import { verificarUmbralYNotificar } from "@/lib/push";
import { esMotivoSalida, NOTA_SALIDA_MAX, type MotivoSalida } from "@/lib/motivos-salida";

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
): Promise<{ lote: LoteRow } | { error: string }> {
  const { rows: loteRows } = await query<LoteRow>(
    "SELECT id, precio_mxn, sucursal_id, activo FROM lotes WHERE qr_token = $1",
    [qrToken]
  );
  const escaneado = loteRows[0];
  if (!escaneado || !escaneado.activo) {
    return { error: "Precio no encontrado o inactivo." };
  }
  if (escaneado.sucursal_id === sucursalId) return { lote: escaneado };

  const { rows: propioRows } = await query<LoteRow>(
    "SELECT id, precio_mxn, sucursal_id, activo FROM lotes WHERE precio_mxn = $1 AND sucursal_id = $2",
    [escaneado.precio_mxn, sucursalId]
  );
  const propio = propioRows[0];
  if (!propio || !propio.activo) {
    return { error: "Este precio no está dado de alta en tu sucursal." };
  }
  return { lote: propio };
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

  const { rows: stockRows } = await query<{ stock: string }>(
    "SELECT stock FROM stock_actual WHERE lote_id = $1",
    [lote.id]
  );
  const stockAntes = Number(stockRows[0]?.stock ?? 0);
  if (input.cantidad > stockAntes) {
    return { error: `Stock insuficiente: quedan ${stockAntes} piezas.` };
  }

  const precio = Number(lote.precio_mxn);

  try {
    await query(
      `INSERT INTO movimientos_inventario
         (lote_id, sucursal_id, tipo, cantidad, usuario_id, precio_unitario_mxn, idempotency_key)
       VALUES ($1, $2, 'venta', $3, $4, $5, $6)`,
      [lote.id, lote.sucursal_id, -input.cantidad, Number(user.id), precio, input.idempotencyKey]
    );
  } catch (err) {
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      // Reenvío duplicado (mismo idempotency_key): ya se registró, no es un error.
      return { success: { cantidad: input.cantidad, total: input.cantidad * precio } };
    }
    throw err;
  }

  await verificarUmbralYNotificar(lote.id, stockAntes, stockAntes - input.cantidad);

  return { success: { cantidad: input.cantidad, total: input.cantidad * precio } };
}

export interface RegistrarCarritoResult {
  error?: string;
  success?: { piezas: number; total: number };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

  // Cada QR → lote de la sucursal del vendedor; líneas que caen en el mismo lote se suman.
  const porLote = new Map<number, { lote: LoteRow; cantidad: number; idempotencyKey: string }>();
  for (const l of input.lineas) {
    const resuelto = await resolverLotePropio(l.qrToken, sucursalId);
    if ("error" in resuelto) return { error: resuelto.error };
    const previo = porLote.get(resuelto.lote.id);
    if (previo) previo.cantidad += l.cantidad;
    else {
      porLote.set(resuelto.lote.id, {
        lote: resuelto.lote,
        cantidad: l.cantidad,
        idempotencyKey: l.idempotencyKey,
      });
    }
  }
  const lineas = [...porLote.values()].sort((a, b) => a.lote.id - b.lote.id);
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);
  const total = lineas.reduce((s, l) => s + l.cantidad * Number(l.lote.precio_mxn), 0);

  type Resultado = { error: string } | { stocks: { loteId: number; antes: number; despues: number }[] } | "duplicada";

  let resultado: Resultado;
  try {
    resultado = await withTransaction<Resultado>(async (client) => {
      // Bloquea los lotes (en orden de id, sin deadlocks): dos ventas simultáneas del
      // mismo precio se turnan, así el stock no puede quedar negativo por una carrera.
      await client.query("SELECT id FROM lotes WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE", [
        lineas.map((l) => l.lote.id),
      ]);

      const { rows: yaRegistrada } = await client.query(
        "SELECT 1 FROM movimientos_inventario WHERE venta_id = $1 LIMIT 1",
        [input.ventaId]
      );
      if (yaRegistrada.length > 0) return "duplicada";

      const stocks: { loteId: number; antes: number; despues: number }[] = [];
      for (const l of lineas) {
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
        await client.query(
          `INSERT INTO movimientos_inventario
             (lote_id, sucursal_id, tipo, cantidad, usuario_id, precio_unitario_mxn, idempotency_key, venta_id)
           VALUES ($1, $2, 'venta', $3, $4, $5, $6, $7)`,
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
 * Registra una SALIDA que no es venta (regalo, saldo, merma, muestra, otro): la
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
         (lote_id, sucursal_id, tipo, cantidad, usuario_id, precio_unitario_mxn, nota, idempotency_key, motivo)
       VALUES ($1, $2, 'salida', $3, $4, $5, $6, $7, $8)`,
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
