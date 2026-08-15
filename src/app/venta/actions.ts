"use server";

import { auth } from "@/auth";
import { query } from "@/lib/db";

interface LoteRow {
  id: number;
  precio_mxn: string;
  sucursal_id: number;
  activo: boolean;
}

async function cargarLoteVendible(token: string, sucursalId: number) {
  const { rows } = await query<LoteRow>(
    "SELECT id, precio_mxn, sucursal_id, activo FROM lotes WHERE qr_token = $1",
    [token]
  );
  const lote = rows[0];
  if (!lote || !lote.activo) return { error: "Precio no encontrado o inactivo." } as const;
  if (lote.sucursal_id !== sucursalId) {
    return { error: "Este precio pertenece a otra sucursal." } as const;
  }
  return { lote } as const;
}

async function contarPiezasVenta(ventaId: string) {
  const { rows } = await query<{ piezas: string }>(
    "SELECT COALESCE(SUM(-cantidad), 0) AS piezas FROM movimientos_inventario WHERE venta_id = $1 AND tipo = 'venta'",
    [ventaId]
  );
  return Number(rows[0]?.piezas ?? 0);
}

export interface RegistrarPiezaResult {
  error?: string;
  success?: { piezas: number; stockRestante: number };
}

/**
 * Registra UNA pieza contada (cada lectura del QR = un movimiento de -1), en vez
 * de un total tecleado. Así el conteo queda en el ledger pieza por pieza, para
 * auditoría exacta de cuántas veces se leyó el QR.
 */
export async function registrarPiezaVentaAction(input: {
  qrToken: string;
  ventaId: string;
  idempotencyKey: string;
}): Promise<RegistrarPiezaResult> {
  const session = await auth();
  const user = session?.user;
  if (!user || user.rol !== "vendedor" || !user.sucursalId) {
    return { error: "No autorizado." };
  }

  const resultado = await cargarLoteVendible(input.qrToken, user.sucursalId);
  if ("error" in resultado) return { error: resultado.error };
  const { lote } = resultado;

  const { rows: stockRows } = await query<{ stock: string }>(
    "SELECT stock FROM stock_actual WHERE lote_id = $1",
    [lote.id]
  );
  const stockActual = Number(stockRows[0]?.stock ?? 0);
  if (stockActual <= 0) {
    return { error: "Sin stock disponible para esta prenda." };
  }

  try {
    await query(
      `INSERT INTO movimientos_inventario
         (lote_id, sucursal_id, tipo, cantidad, usuario_id, precio_unitario_mxn, idempotency_key, venta_id)
       VALUES ($1, $2, 'venta', -1, $3, $4, $5, $6)`,
      [lote.id, lote.sucursal_id, Number(user.id), Number(lote.precio_mxn), input.idempotencyKey, input.ventaId]
    );
  } catch (err) {
    const pgError = err as { code?: string };
    if (pgError.code !== "23505") throw err;
    // Reenvío duplicado (mismo idempotency_key): ya se contó, no es un error.
  }

  const piezas = await contarPiezasVenta(input.ventaId);
  return { success: { piezas, stockRestante: stockActual - 1 } };
}

export interface DeshacerPiezaResult {
  error?: string;
  success?: { piezas: number };
}

export async function deshacerUltimaPiezaAction(input: {
  ventaId: string;
}): Promise<DeshacerPiezaResult> {
  const session = await auth();
  const user = session?.user;
  if (!user || user.rol !== "vendedor") {
    return { error: "No autorizado." };
  }

  const { rows } = await query<{ id: number }>(
    `SELECT id FROM movimientos_inventario
     WHERE venta_id = $1 AND tipo = 'venta' AND usuario_id = $2
     ORDER BY creado_en DESC, id DESC LIMIT 1`,
    [input.ventaId, Number(user.id)]
  );
  const ultima = rows[0];
  if (!ultima) return { error: "No hay piezas que quitar." };

  await query("DELETE FROM movimientos_inventario WHERE id = $1", [ultima.id]);

  const piezas = await contarPiezasVenta(input.ventaId);
  return { success: { piezas } };
}

export interface CancelarVentaResult {
  error?: string;
  success?: true;
}

export async function cancelarVentaAction(input: {
  ventaId: string;
}): Promise<CancelarVentaResult> {
  const session = await auth();
  const user = session?.user;
  if (!user || user.rol !== "vendedor") {
    return { error: "No autorizado." };
  }

  await query(
    "DELETE FROM movimientos_inventario WHERE venta_id = $1 AND tipo = 'venta' AND usuario_id = $2",
    [input.ventaId, Number(user.id)]
  );

  return { success: true };
}
