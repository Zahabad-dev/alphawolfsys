"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { bloquearCifras, desbloquearCifras } from "@/lib/dashboard-candado";

export interface DesbloqueoResult {
  error?: string;
}

// Frena adivinar la contraseña desde una sesión abierta: tras 5 fallos, 5 minutos de espera.
const MAX_INTENTOS = 5;
const ESPERA_MS = 5 * 60 * 1000;
const intentos = new Map<string, { n: number; hasta: number }>();

/**
 * Muestra las cifras del Dashboard. La contraseña debe ser la del administrador o la de soporte
 * (NO la de la persona que tiene la sesión abierta, salvo que sea alguno de ellos).
 */
export async function desbloquearCifrasAction(
  _prev: DesbloqueoResult | undefined,
  formData: FormData
): Promise<DesbloqueoResult> {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") return { error: "No autorizado." };

  const uid = session.user.id;
  const registro = intentos.get(uid);
  if (registro && registro.hasta > Date.now()) {
    return { error: "Demasiados intentos. Espera 5 minutos." };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || !password) return { error: "Escribe la contraseña." };

  const { rows } = await query<{ password_hash: string }>(
    "SELECT password_hash FROM usuarios WHERE rol IN ('admin', 'soporte') AND activo = true"
  );
  let valida = false;
  for (const r of rows) {
    if (await bcrypt.compare(password, r.password_hash)) {
      valida = true;
      break;
    }
  }

  if (!valida) {
    const n = (registro?.n ?? 0) + 1;
    if (n >= MAX_INTENTOS) {
      intentos.set(uid, { n: 0, hasta: Date.now() + ESPERA_MS });
      return { error: "Demasiados intentos. Espera 5 minutos." };
    }
    intentos.set(uid, { n, hasta: 0 });
    return { error: "Contraseña incorrecta." };
  }

  intentos.delete(uid);
  await desbloquearCifras(uid);
  revalidatePath("/admin/dashboard");
  return {};
}

export async function ocultarCifrasAction(): Promise<void> {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") return;
  await bloquearCifras();
  revalidatePath("/admin/dashboard");
}
