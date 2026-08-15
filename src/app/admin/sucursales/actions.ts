"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query, withTransaction } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.rol !== "admin") {
    throw new Error("No autorizado");
  }
}

export interface ActualizarSucursalResult {
  error?: string;
  success?: string;
}

export async function actualizarSucursalAction(
  _prevState: ActualizarSucursalResult | undefined,
  formData: FormData
): Promise<ActualizarSucursalResult> {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const nombre = formData.get("nombre");
  const estado = formData.get("estado");

  if (typeof nombre !== "string" || !nombre.trim()) {
    return { error: "El nombre es obligatorio." };
  }
  if (typeof estado !== "string" || !estado.trim()) {
    return { error: "El estado es obligatorio." };
  }

  await query("UPDATE sucursales SET nombre = $1, estado = $2 WHERE id = $3", [
    nombre.trim(),
    estado.trim(),
    id,
  ]);

  revalidatePath("/admin/sucursales");
  return { success: "Sucursal actualizada." };
}

export interface CrearSucursalResult {
  error?: string;
  success?: string;
}

export async function crearSucursalAction(
  _prevState: CrearSucursalResult | undefined,
  formData: FormData
): Promise<CrearSucursalResult> {
  await requireAdmin();

  const clave = formData.get("clave");
  const nombre = formData.get("nombre");
  const estado = formData.get("estado");

  if (typeof clave !== "string" || !clave.trim()) {
    return { error: "La clave es obligatoria (ej. MOR)." };
  }
  if (typeof nombre !== "string" || !nombre.trim()) {
    return { error: "El nombre es obligatorio." };
  }
  if (typeof estado !== "string" || !estado.trim()) {
    return { error: "El estado es obligatorio." };
  }

  try {
    await query(
      "INSERT INTO sucursales (clave, nombre, estado, tipo) VALUES ($1, $2, $3, 'sucursal')",
      [clave.trim().toUpperCase(), nombre.trim(), estado.trim()]
    );
  } catch (err) {
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      return { error: "Ya existe una sucursal con esa clave." };
    }
    throw err;
  }

  revalidatePath("/admin/sucursales");
  return { success: `Sucursal "${nombre}" creada.` };
}

export async function toggleSucursalActivaAction(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const activa = formData.get("activa") === "true";

  await query("UPDATE sucursales SET activa = $1 WHERE id = $2", [!activa, id]);
  revalidatePath("/admin/sucursales");
}

export interface EliminarSucursalResult {
  error?: string;
  success?: string;
}

export async function eliminarSucursalAction(
  _prevState: EliminarSucursalResult | undefined,
  formData: FormData
): Promise<EliminarSucursalResult> {
  const session = await auth();
  if (!session || session.user.rol !== "admin") {
    return { error: "No autorizado." };
  }

  const id = Number(formData.get("id"));
  const nombreConfirmacion = formData.get("nombre_confirmacion");
  const password = formData.get("password");

  if (!id) return { error: "Sucursal inválida." };
  if (typeof password !== "string" || !password) {
    return { error: "Escribe tu contraseña para confirmar." };
  }

  const { rows: adminRows } = await query<{ password_hash: string }>(
    "SELECT password_hash FROM usuarios WHERE id = $1",
    [Number(session.user.id)]
  );
  const passwordValida = adminRows[0]
    ? await bcrypt.compare(password, adminRows[0].password_hash)
    : false;
  if (!passwordValida) {
    return { error: "Contraseña incorrecta." };
  }

  const { rows: sucursalRows } = await query<{ nombre: string }>(
    "SELECT nombre FROM sucursales WHERE id = $1",
    [id]
  );
  const sucursal = sucursalRows[0];
  if (!sucursal) return { error: "Sucursal no encontrada." };

  if (typeof nombreConfirmacion !== "string" || nombreConfirmacion !== sucursal.nombre) {
    return { error: `Escribe exactamente "${sucursal.nombre}" para confirmar.` };
  }

  const { rows: vendedoresRows } = await query<{ username: string }>(
    "SELECT username FROM usuarios WHERE sucursal_id = $1",
    [id]
  );
  if (vendedoresRows.length > 0) {
    return {
      error: `No se puede eliminar: tiene ${vendedoresRows.length} vendedor(es) asignado(s) (${vendedoresRows
        .map((v) => v.username)
        .join(", ")}). Reasígnalos a otra sucursal primero en Vendedores.`,
    };
  }

  await withTransaction(async (client) => {
    await client.query("DELETE FROM movimientos_inventario WHERE sucursal_id = $1", [id]);
    await client.query("DELETE FROM lotes WHERE sucursal_id = $1", [id]);
    await client.query("DELETE FROM sucursales WHERE id = $1", [id]);
  });

  revalidatePath("/admin/sucursales");
  revalidatePath("/admin/precios");
  revalidatePath("/admin/inventario");
  return { success: `Sucursal "${sucursal.nombre}" eliminada.` };
}
