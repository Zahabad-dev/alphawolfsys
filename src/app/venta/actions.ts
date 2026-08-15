"use server";

import { auth } from "@/auth";
import { query } from "@/lib/db";
import { verificarUmbralYNotificar } from "@/lib/push";

interface LoteRow {
  id: number;
  precio_mxn: string;
  sucursal_id: number;
  activo: boolean;
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

  const { rows: loteRows } = await query<LoteRow>(
    "SELECT id, precio_mxn, sucursal_id, activo FROM lotes WHERE qr_token = $1",
    [input.qrToken]
  );
  const lote = loteRows[0];
  if (!lote || !lote.activo) {
    return { error: "Precio no encontrado o inactivo." };
  }
  if (lote.sucursal_id !== user.sucursalId) {
    return { error: "Este precio pertenece a otra sucursal." };
  }

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
