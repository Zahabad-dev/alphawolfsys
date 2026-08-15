"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query } from "@/lib/db";

export interface RegistrarCorteResult {
  error?: string;
  success?: string;
}

export async function registrarCorteAction(
  _prevState: RegistrarCorteResult | undefined,
  formData: FormData
): Promise<RegistrarCorteResult> {
  const session = await auth();
  if (!session || session.user.rol !== "admin") {
    return { error: "No autorizado." };
  }

  const loteId = Number(formData.get("lote_id"));
  const cantidad = Number(formData.get("cantidad"));
  const nota = formData.get("nota");

  if (!loteId) return { error: "Selecciona un lote del almacén." };
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return { error: "La cantidad debe ser un número entero mayor a 0." };
  }

  const { rows } = await query<{ sucursal_id: number; tipo: string }>(
    `SELECT l.sucursal_id, s.tipo
     FROM lotes l JOIN sucursales s ON s.id = l.sucursal_id
     WHERE l.id = $1`,
    [loteId]
  );
  const lote = rows[0];
  if (!lote) return { error: "Lote no encontrado." };
  if (lote.tipo !== "almacen") return { error: "Ese lote no pertenece al Almacén Central." };

  await query(
    `INSERT INTO movimientos_inventario (lote_id, sucursal_id, tipo, cantidad, usuario_id, nota)
     VALUES ($1, $2, 'corte', $3, $4, $5)`,
    [loteId, lote.sucursal_id, cantidad, Number(session.user.id), typeof nota === "string" && nota ? nota : null]
  );

  revalidatePath("/admin/corte");
  revalidatePath("/admin/inventario");
  revalidatePath("/admin/traspasos");
  return { success: `Corte registrado: +${cantidad} piezas.` };
}
