"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Carrito de la venta en curso, guardado en el celular (localStorage) para que
 * sobreviva a las navegaciones de página completa del flujo de venta
 * (/venta/escanear ↔ /venta/confirmar) y a cerrar la app a medias.
 *
 * Una venta puede llevar varios precios; cada precio es UNA línea. Si se vuelve
 * a agregar el mismo precio (escaneando o tecleando), las piezas se SUMAN.
 */

const CLAVE = "wd-carrito-v1";
const VIGENCIA_MS = 12 * 60 * 60 * 1000; // una venta olvidada no sobrevive al día siguiente

export interface LineaCarrito {
  /** UUID de la línea: se usa como idempotency_key del movimiento en el servidor. */
  id: string;
  qrToken: string;
  nombre: string;
  precio: number;
  cantidad: number;
  /** Último stock conocido de ese precio en la sucursal (solo referencia para avisos). */
  stockRef: number;
}

export interface Carrito {
  /** UUID de la venta completa: agrupa sus movimientos (venta_id) y evita registrarla dos veces. */
  ventaId: string;
  lineas: LineaCarrito[];
  actualizadoEn: string;
}

export interface ItemCatalogo {
  qrToken: string;
  nombre: string;
  precio: number;
  stock: number;
}

const VACIO: Carrito = { ventaId: "", lineas: [], actualizadoEn: "" };

const suscriptores = new Set<() => void>();

function notificar() {
  suscriptores.forEach((fn) => fn());
}

function suscribir(callback: () => void) {
  suscriptores.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    suscriptores.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function leerCrudo(): string {
  try {
    return window.localStorage.getItem(CLAVE) ?? "";
  } catch {
    return "";
  }
}

function interpretar(crudo: string): Carrito {
  if (!crudo) return VACIO;
  try {
    const data = JSON.parse(crudo) as Carrito;
    if (!data || !Array.isArray(data.lineas) || data.lineas.length === 0) return VACIO;
    if (Date.now() - new Date(data.actualizadoEn).getTime() > VIGENCIA_MS) return VACIO;
    return data;
  } catch {
    return VACIO;
  }
}

function guardar(carrito: Carrito) {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(carrito));
  } catch {
    // Almacenamiento bloqueado (modo privado, etc.): el carrito no persiste pero la venta sigue.
  }
  notificar();
}

export function leerCarrito(): Carrito {
  return interpretar(leerCrudo());
}

/** Hook reactivo: se actualiza solo cuando cambia el carrito (también entre pestañas). */
export function useCarrito(): Carrito {
  const crudo = useSyncExternalStore(suscribir, leerCrudo, () => "");
  return useMemo(() => interpretar(crudo), [crudo]);
}

/** Agrega piezas de un precio; si ya hay una línea con ese precio, las suma. */
export function agregarAlCarrito(item: ItemCatalogo, cantidad: number): Carrito {
  const actual = leerCarrito();
  const carrito: Carrito = {
    ventaId: actual.ventaId || crypto.randomUUID(),
    lineas: actual.lineas.map((l) => ({ ...l })),
    actualizadoEn: new Date().toISOString(),
  };

  const existente = carrito.lineas.find((l) => l.precio === item.precio);
  if (existente) {
    existente.cantidad += cantidad;
    existente.stockRef = item.stock;
  } else {
    carrito.lineas.push({
      id: crypto.randomUUID(),
      qrToken: item.qrToken,
      nombre: item.nombre,
      precio: item.precio,
      cantidad,
      stockRef: item.stock,
    });
  }

  guardar(carrito);
  return carrito;
}

export function quitarDelCarrito(idLinea: string) {
  const actual = leerCarrito();
  const lineas = actual.lineas.filter((l) => l.id !== idLinea);
  if (lineas.length === 0) {
    vaciarCarrito();
    return;
  }
  guardar({ ...actual, lineas, actualizadoEn: new Date().toISOString() });
}

export function vaciarCarrito() {
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {
    // ver guardar()
  }
  notificar();
}

export function totalesDe(lineas: { precio: number; cantidad: number }[]) {
  let piezas = 0;
  let total = 0;
  for (const l of lineas) {
    piezas += l.cantidad;
    total += l.cantidad * l.precio;
  }
  return { piezas, total };
}

export function dinero(n: number) {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
