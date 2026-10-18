import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Candado de las cifras del Dashboard.
 *
 * El panel puede estar abierto con la sesión de una empleada (tablet, equipo compartido), así que
 * las cifras de ventas NO se muestran solo por tener la sesión iniciada: hay que "Mostrar cifras"
 * con la contraseña del administrador o de soporte. El permiso es una cookie firmada, ligada a la
 * sesión que lo pidió y de corta duración; vence sola y se puede ocultar antes.
 */
export const COOKIE_CIFRAS = "wd_cifras";
export const VIGENCIA_CIFRAS_SEG = 5 * 60;

function secreto(): string | null {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null;
}

function firmar(userId: string, exp: number, clave: string): string {
  return createHmac("sha256", clave).update(`cifras:${userId}:${exp}`).digest("base64url");
}

/** Hasta cuándo (ms) están desbloqueadas las cifras para esta sesión, o null si están ocultas. */
export async function cifrasDesbloqueadasHasta(userId: string): Promise<number | null> {
  const clave = secreto();
  if (!clave) return null; // sin secreto no se puede firmar: se queda bloqueado
  const valor = (await cookies()).get(COOKIE_CIFRAS)?.value;
  if (!valor) return null;

  const [expTxt, firma] = valor.split(".");
  const exp = Number(expTxt);
  if (!Number.isFinite(exp) || !firma || exp * 1000 <= Date.now()) return null;

  const esperada = Buffer.from(firmar(userId, exp, clave));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  return exp * 1000;
}

export async function desbloquearCifras(userId: string): Promise<void> {
  const clave = secreto();
  if (!clave) throw new Error("Falta AUTH_SECRET");
  const exp = Math.floor(Date.now() / 1000) + VIGENCIA_CIFRAS_SEG;
  (await cookies()).set(COOKIE_CIFRAS, `${exp}.${firmar(userId, exp, clave)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: VIGENCIA_CIFRAS_SEG,
  });
}

export async function bloquearCifras(): Promise<void> {
  (await cookies()).set(COOKIE_CIFRAS, "", { path: "/admin", maxAge: 0 });
}
