"use client";

import { registrarSalidaAction } from "./actions";
import { encolarVenta } from "@/lib/offline-db";

const TIMEOUT_MS = 6000;

export type EnvioSalida =
  | { tipo: "registrada" | "guardada-local" }
  | { tipo: "error"; mensaje: string };

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

export interface DatosSalida {
  qrToken: string;
  cantidad: number;
  motivo: string;
  nota: string;
  idempotencyKey: string;
}

async function guardarLocal(datos: DatosSalida): Promise<void> {
  await encolarVenta({ tipo: "salida", ...datos, creadoEn: new Date().toISOString() });
}

/**
 * Manda la salida al servidor. Sin señal (o si tarda más de 6 s) queda guardada en
 * el celular y se sincroniza sola; el servidor es idempotente por idempotencyKey,
 * así que un reintento nunca la duplica.
 */
export async function enviarSalida(datos: DatosSalida): Promise<EnvioSalida> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await guardarLocal(datos);
    return { tipo: "guardada-local" };
  }

  try {
    const respuesta = await Promise.race([registrarSalidaAction(datos), timeout(TIMEOUT_MS)]);
    if (respuesta.error) return { tipo: "error", mensaje: respuesta.error };
    return { tipo: "registrada" };
  } catch {
    await guardarLocal(datos);
    return { tipo: "guardada-local" };
  }
}
