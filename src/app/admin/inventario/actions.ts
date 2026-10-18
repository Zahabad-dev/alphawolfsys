"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { esAdmin } from "@/lib/permisos";
import { verificarUmbralYNotificar } from "@/lib/push";

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

export interface RegistrarAjusteResult {
  error?: string;
  success?: string;
}

/**
 * Corrige el stock de CUALQUIER lugar (Almacén o sucursal): error de captura, merma, piezas
 * contadas de más… Solo administración (administrador o soporte). Resta o suma piezas y exige:
 * nota obligatoria y la contraseña de quien lo hace (aunque ya tenga la sesión abierta, por si
 * la pantalla se queda abierta en una tablet). Queda registrado a nombre de quien lo hizo y no
 * se puede restar más de lo que hay.
 */
export async function registrarAjusteAction(
  _prevState: RegistrarAjusteResult | undefined,
  formData: FormData
): Promise<RegistrarAjusteResult> {
  const session = await auth();
  if (!session || !esAdmin(session.user.rol)) {
    return { error: "No autorizado." };
  }

  const loteId = Number(formData.get("lote_id"));
  const direccion = formData.get("direccion");
  const piezas = Number(formData.get("piezas"));
  const nota = formData.get("nota");

  if (!loteId) return { error: "Selecciona el lugar y el precio." };
  if (!Number.isInteger(piezas) || piezas <= 0) {
    return { error: "Las piezas deben ser un número entero mayor a 0." };
  }
  if (direccion !== "resta" && direccion !== "suma") {
    return { error: "Selecciona si el ajuste suma o resta piezas." };
  }
  if (typeof nota !== "string" || !nota.trim()) {
    return { error: "Escribe una nota explicando el ajuste (obligatoria)." };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || !password) {
    return { error: "Escribe tu contraseña para confirmar." };
  }
  const { rows: yo } = await query<{ password_hash: string }>(
    "SELECT password_hash FROM usuarios WHERE id = $1",
    [Number(session.user.id)]
  );
  const passwordValida = yo[0] ? await bcrypt.compare(password, yo[0].password_hash) : false;
  if (!passwordValida) {
    return { error: "Contraseña incorrecta." };
  }

  const { rows } = await query<{ sucursal_id: number; lugar: string }>(
    `SELECT l.sucursal_id, s.nombre AS lugar
     FROM lotes l JOIN sucursales s ON s.id = l.sucursal_id
     WHERE l.id = $1`,
    [loteId]
  );
  const lote = rows[0];
  if (!lote) return { error: "Precio no encontrado." };

  const cantidad = direccion === "resta" ? -piezas : piezas;

  const { rows: stockRows } = await query<{ stock: string }>(
    "SELECT stock FROM stock_actual WHERE lote_id = $1",
    [loteId]
  );
  const stockAntes = Number(stockRows[0]?.stock ?? 0);
  if (cantidad < 0 && piezas > stockAntes) {
    return { error: `Stock insuficiente en ${lote.lugar}: solo hay ${stockAntes} piezas.` };
  }

  await query(
    `INSERT INTO movimientos_inventario (lote_id, sucursal_id, tipo, cantidad, usuario_id, nota)
     VALUES ($1, $2, 'ajuste', $3, $4, $5)`,
    [loteId, lote.sucursal_id, cantidad, Number(session.user.id), nota.trim()]
  );

  if (cantidad < 0) {
    await verificarUmbralYNotificar(loteId, stockAntes, stockAntes + cantidad);
  }

  revalidatePath("/admin/inventario");
  revalidatePath("/inventario");
  revalidatePath("/admin/corte");
  revalidatePath("/admin/traspasos");
  revalidatePath("/admin/dashboard");
  return {
    success: `Ajuste registrado en ${lote.lugar}: ${cantidad > 0 ? "+" : ""}${cantidad} piezas.`,
  };
}
