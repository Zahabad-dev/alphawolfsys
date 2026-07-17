"use server";

import { auth } from "@/auth";
import { query } from "@/lib/db";

interface LoteRow {
  id: number;
  nombre: string;
  precio_mxn: string;
  sucursal_id: number;
  activo: boolean;
}

interface StockRow {
  stock: number;
}

export interface RegistrarVentaResult {
  error?: string;
  success?: { cantidad: number; total: number };
}

export async function registrarVentaAction(
  _prevState: RegistrarVentaResult | undefined,
  formData: FormData
): Promise<RegistrarVentaResult> {
  const session = await auth();
  const user = session?.user;
  if (!user || user.rol !== "vendedor" || !user.sucursalId) {
    return { error: "No autorizado." };
  }

  const token = formData.get("qr_token");
  const cantidadRaw = formData.get("cantidad");
  const idempotencyKey = formData.get("idempotency_key");

  if (typeof token !== "string" || typeof idempotencyKey !== "string") {
    return { error: "Solicitud inválida." };
  }

  const cantidad = Number(cantidadRaw);
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return { error: "La cantidad debe ser un número entero mayor a 0." };
  }

  const { rows: loteRows } = await query<LoteRow>(
    "SELECT id, nombre, precio_mxn, sucursal_id, activo FROM lotes WHERE qr_token = $1",
    [token]
  );
  const lote = loteRows[0];
  if (!lote || !lote.activo) {
    return { error: "Lote no encontrado o inactivo." };
  }
  if (lote.sucursal_id !== user.sucursalId) {
    return { error: "Este lote pertenece a otra sucursal." };
  }

  const { rows: stockRows } = await query<StockRow>(
    "SELECT stock FROM stock_actual WHERE lote_id = $1",
    [lote.id]
  );
  const stockActual = stockRows[0]?.stock ?? 0;
  if (cantidad > stockActual) {
    return { error: `Stock insuficiente: quedan ${stockActual} piezas.` };
  }

  const precio = Number(lote.precio_mxn);

  try {
    await query(
      `INSERT INTO movimientos_inventario
         (lote_id, sucursal_id, tipo, cantidad, usuario_id, precio_unitario_mxn, idempotency_key)
       VALUES ($1, $2, 'venta', $3, $4, $5, $6)`,
      [lote.id, lote.sucursal_id, -cantidad, Number(user.id), precio, idempotencyKey]
    );
  } catch (err) {
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      // Reenvío duplicado (mismo idempotency_key): ya se registró, tratar como éxito.
      return { success: { cantidad, total: cantidad * precio } };
    }
    throw err;
  }

  return { success: { cantidad, total: cantidad * precio } };
}
