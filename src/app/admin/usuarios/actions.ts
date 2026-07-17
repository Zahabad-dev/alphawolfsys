"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.rol !== "admin") {
    throw new Error("No autorizado");
  }
}

export interface CrearVendedorResult {
  error?: string;
  success?: string;
}

export async function crearVendedorAction(
  _prevState: CrearVendedorResult | undefined,
  formData: FormData
): Promise<CrearVendedorResult> {
  await requireAdmin();

  const username = formData.get("username");
  const nombre = formData.get("nombre");
  const password = formData.get("password");
  const sucursalId = Number(formData.get("sucursal_id"));

  if (typeof username !== "string" || !username.trim()) {
    return { error: "El usuario es obligatorio." };
  }
  if (typeof nombre !== "string" || !nombre.trim()) {
    return { error: "El nombre es obligatorio." };
  }
  if (typeof password !== "string" || password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (!sucursalId) {
    return { error: "Selecciona una sucursal." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await query(
      `INSERT INTO usuarios (username, password_hash, nombre, rol, sucursal_id)
       VALUES ($1, $2, $3, 'vendedor', $4)`,
      [username.trim(), passwordHash, nombre.trim(), sucursalId]
    );
  } catch (err) {
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      return { error: "Ese nombre de usuario ya existe." };
    }
    throw err;
  }

  revalidatePath("/admin/usuarios");
  return { success: `Vendedor "${nombre}" creado.` };
}

export async function toggleUsuarioActivoAction(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const activo = formData.get("activo") === "true";

  await query("UPDATE usuarios SET activo = $1 WHERE id = $2", [!activo, id]);
  revalidatePath("/admin/usuarios");
}

export async function reasignarSucursalAction(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const sucursalId = Number(formData.get("sucursal_id"));
  if (!sucursalId) return;

  await query("UPDATE usuarios SET sucursal_id = $1 WHERE id = $2 AND rol = 'vendedor'", [
    sucursalId,
    id,
  ]);
  revalidatePath("/admin/usuarios");
}
