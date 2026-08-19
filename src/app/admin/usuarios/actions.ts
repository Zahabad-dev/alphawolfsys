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
  return session;
}

async function requireStaff() {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") {
    throw new Error("No autorizado");
  }
  return session;
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
  const rolRaw = formData.get("rol");
  const rol = rolRaw === "gerente" || rolRaw === "soporte" ? rolRaw : "vendedor";
  const sucursalId = rol === "vendedor" ? Number(formData.get("sucursal_id")) : null;

  if (typeof username !== "string" || !username.trim()) {
    return { error: "El usuario es obligatorio." };
  }
  if (typeof nombre !== "string" || !nombre.trim()) {
    return { error: "El nombre es obligatorio." };
  }
  if (typeof password !== "string" || password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (rol === "vendedor" && !sucursalId) {
    return { error: "Selecciona una sucursal." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await query(
      `INSERT INTO usuarios (username, password_hash, nombre, rol, sucursal_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [username.trim(), passwordHash, nombre.trim(), rol, sucursalId]
    );
  } catch (err) {
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      return { error: "Ese nombre de usuario ya existe." };
    }
    throw err;
  }

  const etiquetaRol = rol === "gerente" ? "Gerente" : rol === "soporte" ? "Usuario de soporte" : "Vendedor";
  revalidatePath("/admin/usuarios");
  return { success: `${etiquetaRol} "${nombre}" creado.` };
}

export async function toggleUsuarioActivoAction(formData: FormData) {
  await requireStaff();

  const id = Number(formData.get("id"));
  const activo = formData.get("activo") === "true";

  await query("UPDATE usuarios SET activo = $1 WHERE id = $2", [!activo, id]);
  revalidatePath("/admin/usuarios");
}

export async function reasignarSucursalAction(formData: FormData) {
  await requireStaff();

  const id = Number(formData.get("id"));
  const sucursalId = Number(formData.get("sucursal_id"));
  if (!sucursalId) return;

  await query("UPDATE usuarios SET sucursal_id = $1 WHERE id = $2 AND rol = 'vendedor'", [
    sucursalId,
    id,
  ]);
  revalidatePath("/admin/usuarios");
}

export interface EliminarVendedorResult {
  error?: string;
  success?: string;
}

export async function eliminarVendedorAction(
  _prevState: EliminarVendedorResult | undefined,
  formData: FormData
): Promise<EliminarVendedorResult> {
  const session = await requireAdmin();

  const id = Number(formData.get("id"));
  const usernameConfirmacion = formData.get("username_confirmacion");
  const password = formData.get("password");

  if (!id) return { error: "Vendedor inválido." };
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

  const { rows: vendedorRows } = await query<{ username: string; rol: string }>(
    "SELECT username, rol FROM usuarios WHERE id = $1",
    [id]
  );
  const vendedor = vendedorRows[0];
  if (!vendedor) return { error: "Vendedor no encontrado." };
  if (vendedor.rol !== "vendedor") return { error: "Solo se pueden eliminar cuentas de vendedor." };

  if (typeof usernameConfirmacion !== "string" || usernameConfirmacion !== vendedor.username) {
    return { error: `Escribe exactamente "${vendedor.username}" para confirmar.` };
  }

  try {
    await query("DELETE FROM usuarios WHERE id = $1", [id]);
  } catch (err) {
    const pgError = err as { code?: string };
    if (pgError.code === "23503") {
      return {
        error: `"${vendedor.username}" ya tiene ventas u otros movimientos registrados — no se puede eliminar sin perder ese historial. Desactívalo en vez de eliminarlo.`,
      };
    }
    throw err;
  }

  revalidatePath("/admin/usuarios");
  return { success: `Vendedor "${vendedor.username}" eliminado.` };
}
