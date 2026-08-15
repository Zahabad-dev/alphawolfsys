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
  if (!session || session.user.rol === "vendedor") {
    return { error: "No autorizado." };
  }

  const loteId = Number(formData.get("lote_id"));
  const cantidad = Number(formData.get("cantidad"));
  const nota = formData.get("nota");

  if (!loteId) return { error: "Selecciona un precio del almacén." };
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
  if (!lote) return { error: "Precio no encontrado." };
  if (lote.tipo !== "almacen") return { error: "Ese precio no pertenece al Almacén Central." };

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

export interface RegistrarAjusteResult {
  error?: string;
  success?: string;
}

/**
 * Corrige el stock del Almacén (merma, error de captura, etc.). Solo admin —
 * a diferencia del corte, un ajuste puede restar piezas, así que queda fuera
 * de lo que gerente puede hacer.
 */
export async function registrarAjusteAction(
  _prevState: RegistrarAjusteResult | undefined,
  formData: FormData
): Promise<RegistrarAjusteResult> {
  const session = await auth();
  if (!session || session.user.rol !== "admin") {
    return { error: "No autorizado." };
  }

  const loteId = Number(formData.get("lote_id"));
  const direccion = formData.get("direccion");
  const piezas = Number(formData.get("piezas"));
  const nota = formData.get("nota");

  if (!loteId) return { error: "Selecciona un precio del almacén." };
  if (!Number.isInteger(piezas) || piezas <= 0) {
    return { error: "Las piezas deben ser un número entero mayor a 0." };
  }
  if (direccion !== "resta" && direccion !== "suma") {
    return { error: "Selecciona si el ajuste suma o resta piezas." };
  }
  if (typeof nota !== "string" || !nota.trim()) {
    return { error: "Escribe una nota explicando el ajuste (obligatoria)." };
  }

  const { rows } = await query<{ sucursal_id: number; tipo: string }>(
    `SELECT l.sucursal_id, s.tipo
     FROM lotes l JOIN sucursales s ON s.id = l.sucursal_id
     WHERE l.id = $1`,
    [loteId]
  );
  const lote = rows[0];
  if (!lote) return { error: "Precio no encontrado." };
  if (lote.tipo !== "almacen") return { error: "Ese precio no pertenece al Almacén Central." };

  const cantidad = direccion === "resta" ? -piezas : piezas;

  if (cantidad < 0) {
    const { rows: stockRows } = await query<{ stock: string }>(
      "SELECT stock FROM stock_actual WHERE lote_id = $1",
      [loteId]
    );
    const stock = Number(stockRows[0]?.stock ?? 0);
    if (piezas > stock) {
      return { error: `Stock insuficiente en Almacén: solo hay ${stock} piezas.` };
    }
  }

  await query(
    `INSERT INTO movimientos_inventario (lote_id, sucursal_id, tipo, cantidad, usuario_id, nota)
     VALUES ($1, $2, 'ajuste', $3, $4, $5)`,
    [loteId, lote.sucursal_id, cantidad, Number(session.user.id), nota.trim()]
  );

  revalidatePath("/admin/corte");
  revalidatePath("/admin/inventario");
  revalidatePath("/admin/traspasos");
  revalidatePath("/admin/dashboard");
  return { success: `Ajuste registrado: ${cantidad > 0 ? "+" : ""}${cantidad} piezas.` };
}
