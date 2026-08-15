"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query } from "@/lib/db";

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
