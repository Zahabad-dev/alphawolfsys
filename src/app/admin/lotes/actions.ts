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

export async function crearLoteAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  await requireAdmin();

  const nombre = formData.get("nombre");
  const precio = formData.get("precio_mxn");
  const sucursalId = formData.get("sucursal_id");

  if (typeof nombre !== "string" || !nombre.trim()) {
    return { error: "El nombre del lote es obligatorio." };
  }
  const precioNum = Number(precio);
  if (!precioNum || precioNum <= 0) {
    return { error: "El precio debe ser mayor a 0." };
  }
  const sucursalIdNum = Number(sucursalId);
  if (!sucursalIdNum) {
    return { error: "Selecciona una sucursal." };
  }

  await query(
    "INSERT INTO lotes (nombre, precio_mxn, sucursal_id) VALUES ($1, $2, $3)",
    [nombre.trim(), precioNum, sucursalIdNum]
  );

  revalidatePath("/admin/lotes");
  return { success: "Lote creado." };
}

export async function toggleLoteActivoAction(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const activo = formData.get("activo") === "true";

  await query("UPDATE lotes SET activo = $1 WHERE id = $2", [!activo, id]);
  revalidatePath("/admin/lotes");
}
