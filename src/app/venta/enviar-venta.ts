"use client";

import { registrarVentaCarritoAction } from "./actions";
import { encolarVenta } from "@/lib/offline-db";
import { totalesDe, type Carrito } from "@/lib/carrito";

const TIMEOUT_MS = 6000;

export interface LineaResumen {
  precio: number;
  cantidad: number;
}

export type EnvioResultado =
  | { tipo: "registrada"; lineas: LineaResumen[]; piezas: number; total: number }
  | { tipo: "guardada-local"; lineas: LineaResumen[]; piezas: number; total: number }
  | { tipo: "error"; mensaje: string };

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function guardarLocal(carrito: Carrito): Promise<void> {
  await encolarVenta({
    ventaId: carrito.ventaId,
    lineas: carrito.lineas.map((l) => ({
      qrToken: l.qrToken,
      cantidad: l.cantidad,
      precio: l.precio,
      idempotencyKey: l.id,
    })),
    creadoEn: new Date().toISOString(),
  });
}

/**
 * Manda la venta completa al servidor. Sin señal (o si tarda más de 6 s) la
 * deja guardada en el celular para sincronizar después; el servidor es
 * idempotente por venta, así que un reintento nunca la duplica.
 */
export async function enviarVenta(carrito: Carrito): Promise<EnvioResultado> {
  const lineas: LineaResumen[] = carrito.lineas.map((l) => ({ precio: l.precio, cantidad: l.cantidad }));
  const { piezas, total } = totalesDe(lineas);

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await guardarLocal(carrito);
    return { tipo: "guardada-local", lineas, piezas, total };
  }

  try {
    const respuesta = await Promise.race([
      registrarVentaCarritoAction({
        ventaId: carrito.ventaId,
        lineas: carrito.lineas.map((l) => ({
          qrToken: l.qrToken,
          cantidad: l.cantidad,
          idempotencyKey: l.id,
        })),
      }),
      timeout(TIMEOUT_MS),
    ]);
    if (respuesta.error) return { tipo: "error", mensaje: respuesta.error };
    return { tipo: "registrada", lineas, piezas, total };
  } catch {
    await guardarLocal(carrito);
    return { tipo: "guardada-local", lineas, piezas, total };
  }
}
