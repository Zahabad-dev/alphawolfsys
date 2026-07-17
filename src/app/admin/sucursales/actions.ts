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

export async function toggleSucursalActivaAction(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const activa = formData.get("activa") === "true";

  await query("UPDATE sucursales SET activa = $1 WHERE id = $2", [!activa, id]);
  revalidatePath("/admin/sucursales");
}
