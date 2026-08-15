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

export async function crearPrecioAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  await requireAdmin();

  const precio = formData.get("precio_mxn");
  const sucursalId = formData.get("sucursal_id");

  const precioNum = Number(precio);
  if (!precioNum || precioNum <= 0) {
    return { error: "El precio debe ser mayor a 0." };
  }
  const sucursalIdNum = Number(sucursalId);
  if (!sucursalIdNum) {
    return { error: "Selecciona una sucursal." };
  }

  const { rows: existentes } = await query(
    "SELECT id FROM lotes WHERE sucursal_id = $1 AND precio_mxn = $2 AND activo = true",
    [sucursalIdNum, precioNum]
  );
  if (existentes.length > 0) {
    return { error: "Esa sucursal ya tiene un precio activo con ese mismo monto." };
  }

  // La etiqueta se genera del precio — ya no se pide un nombre libre (evita
  // confusiones tipo "Lote AB"; lo único que identifica un precio es su monto).
  const etiqueta = `$${precioNum.toFixed(2)}`;

  await query(
    "INSERT INTO lotes (nombre, precio_mxn, sucursal_id) VALUES ($1, $2, $3)",
    [etiqueta, precioNum, sucursalIdNum]
  );

  revalidatePath("/admin/precios");
  return { success: "Precio agregado." };
}

export async function togglePrecioActivoAction(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const activo = formData.get("activo") === "true";

  await query("UPDATE lotes SET activo = $1 WHERE id = $2", [!activo, id]);
  revalidatePath("/admin/precios");
}
