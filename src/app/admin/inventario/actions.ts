"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query } from "@/lib/db";

export interface RegistrarEntradaResult {
  error?: string;
  success?: string;
}

export async function registrarEntradaAction(
  _prevState: RegistrarEntradaResult | undefined,
  formData: FormData
): Promise<RegistrarEntradaResult> {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") {
    return { error: "No autorizado." };
  }

  const loteId = Number(formData.get("lote_id"));
  const cantidad = Number(formData.get("cantidad"));
  const nota = formData.get("nota");

  if (!loteId) return { error: "Selecciona un precio." };
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return { error: "La cantidad debe ser un número entero mayor a 0." };
  }

  const { rows } = await query<{ sucursal_id: number }>(
    "SELECT sucursal_id FROM lotes WHERE id = $1",
    [loteId]
  );
  const lote = rows[0];
  if (!lote) return { error: "Precio no encontrado." };

  await query(
    `INSERT INTO movimientos_inventario (lote_id, sucursal_id, tipo, cantidad, usuario_id, nota)
     VALUES ($1, $2, 'entrada', $3, $4, $5)`,
    [loteId, lote.sucursal_id, cantidad, Number(session.user.id), typeof nota === "string" ? nota : null]
  );

  revalidatePath("/admin/inventario");
  revalidatePath("/inventario");
  return { success: `Entrada registrada: +${cantidad} piezas.` };
}

export interface ActualizarUmbralResult {
  error?: string;
  success?: string;
}

export async function actualizarUmbralAction(
  _prevState: ActualizarUmbralResult | undefined,
  formData: FormData
): Promise<ActualizarUmbralResult> {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") {
    return { error: "No autorizado." };
  }

  const id = Number(formData.get("id"));
  const umbral = Number(formData.get("umbral_stock"));

  if (!id) return { error: "Precio inválido." };
  if (!Number.isInteger(umbral) || umbral < 0) {
    return { error: "El mínimo debe ser un número entero mayor o igual a 0." };
  }

  await query("UPDATE lotes SET umbral_stock = $1 WHERE id = $2", [umbral, id]);

  revalidatePath("/admin/inventario");
  revalidatePath("/admin/dashboard");
  return { success: "Mínimo actualizado." };
}
