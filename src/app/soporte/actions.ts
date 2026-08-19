"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query } from "@/lib/db";

async function requireAccesoSoporte() {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") {
    throw new Error("No autorizado");
  }
}

export async function marcarResueltoAction(formData: FormData) {
  await requireAccesoSoporte();

  const id = Number(formData.get("id"));
  const resuelto = formData.get("resuelto") === "true";

  await query("UPDATE errores_soporte SET resuelto = $1 WHERE id = $2", [!resuelto, id]);
  revalidatePath("/soporte");
}
