import { etiquetaMotivo } from "@/lib/motivos-salida";

/**
 * Utilidades del Historial por sucursal: valida el día pedido y convierte las filas del
 * ledger en el "cuadre" del día (de dónde salió y a dónde fue cada pieza).
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * El día pedido en la URL si es una fecha real (YYYY-MM-DD); si no, null. Se exige año >= 2000:
 * JavaScript acepta "0000-01-01" pero Postgres no, y eso tumbaría la página con un error 500.
 */
export function diaValido(valor: string): string | null {
  if (!ISO.test(valor) || Number(valor.slice(0, 4)) < 2000) return null;
  const d = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor ? null : valor;
}

/** Id entero positivo que cabe en un INTEGER de Postgres; cualquier otra cosa (texto, 1.5, 1e21) da 0 = "sin filtro". */
export function enteroPositivo(valor: string | null | undefined): number {
  // Solo dígitos decimales sin ceros a la izquierda: "1e3", "0x10", " 5" o "+5" no filtran por otro id.
  if (typeof valor !== "string" || !/^[1-9]\d{0,9}$/.test(valor)) return 0;
  const n = Number(valor);
  return n <= 2147483647 ? n : 0;
}

/** Primer día que acepta diaValido; los selectores de fecha lo usan como mínimo. */
export const DIA_MINIMO = "2000-01-01";

/** Suma (o resta) días a una fecha YYYY-MM-DD, sin depender de la zona horaria. */
export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Fecha larga en español, ej. "jueves 29 de octubre de 2026". */
export function diaLargo(dia: string): string {
  const texto = new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-MX", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export interface MovimientoDia {
  /** BIGSERIAL: el driver lo entrega como texto. Solo se usa para armar claves. */
  id: number | string;
  /** TIMESTAMPTZ: el driver lo entrega como Date. */
  creado_en: Date | string;
  lote_id: number;
  precio_mxn: string;
  tipo: string;
  cantidad: number;
  usuario_nombre: string;
  nota: string | null;
  motivo: string | null;
  venta_id: string | null;
  /** Sucursal del otro lado de un traspaso (origen o destino), si aplica. */
  otra_sucursal: string | null;
}

/** Una línea de la bitácora del día: un movimiento suelto o una venta completa agrupada. */
export interface Linea {
  clave: string;
  hora: Date | string;
  /** Un tipo que la tabla de etiquetas no conozca (si la base agrega uno nuevo) se muestra tal cual. */
  tipo: string;
  /** Piezas netas de la línea (negativo si descuenta inventario). */
  piezas: number;
  /** Texto corto: "3 × $140 · 2 × $205", "Entrada", "Merma"… */
  detalle: string;
  usuario: string;
  nota: string;
  /** Existencia total de la sucursal justo DESPUÉS de este renglón. */
  existencia: number;
  /** Descuenta inventario sin ser venta ni traspaso: se marca para revisar. */
  revisar: boolean;
}

const precioTxt = (p: string) => `$${Number(p).toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;

/** "3 × $140 · 2 × $205" para un conjunto de movimientos, de menor a mayor precio. */
function desglosePorPrecio(movs: Array<{ precio_mxn: string; cantidad: number }>): string {
  const porPrecio = new Map<string, number>();
  for (const m of movs) {
    porPrecio.set(m.precio_mxn, (porPrecio.get(m.precio_mxn) ?? 0) + Math.abs(m.cantidad));
  }
  return [...porPrecio.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([p, n]) => `${n} × ${precioTxt(p)}`)
    .join(" · ");
}

/**
 * Arma la bitácora del día. `movimientos` debe venir en orden cronológico ascendente;
 * `existenciaInicial` es la existencia total de la sucursal a las 00:00 del día. Las piezas de
 * una misma venta (mismo venta_id) se muestran como UNA línea, no una por pieza.
 * El resultado queda del más reciente al más antiguo.
 */
export function armarLineas(movimientos: MovimientoDia[], existenciaInicial: number): Linea[] {
  const lineas: Linea[] = [];
  const ventas = new Map<string, MovimientoDia[]>();
  const orden: Array<{ tipo: "grupo"; id: string } | { tipo: "suelto"; m: MovimientoDia }> = [];

  for (const m of movimientos) {
    if (m.tipo === "venta" && m.venta_id) {
      if (!ventas.has(m.venta_id)) {
        ventas.set(m.venta_id, []);
        orden.push({ tipo: "grupo", id: m.venta_id });
      }
      ventas.get(m.venta_id)!.push(m);
    } else {
      orden.push({ tipo: "suelto", m });
    }
  }

  let existencia = existenciaInicial;
  for (const item of orden) {
    if (item.tipo === "grupo") {
      const movs = ventas.get(item.id)!;
      const piezas = movs.reduce((t, m) => t + m.cantidad, 0);
      existencia += piezas;
      lineas.push({
        clave: `v-${item.id}`,
        hora: movs[movs.length - 1].creado_en,
        tipo: "venta",
        piezas,
        detalle: desglosePorPrecio(movs),
        usuario: movs[0].usuario_nombre,
        nota: "",
        existencia,
        revisar: false,
      });
      continue;
    }

    const m = item.m;
    existencia += m.cantidad;
    const precio = precioTxt(m.precio_mxn);
    const piezas = Math.abs(m.cantidad);
    let detalle: string;
    switch (m.tipo) {
      case "venta":
        detalle = `${piezas} × ${precio}`;
        break;
      case "traspaso_salida":
        detalle = `${piezas} × ${precio} → ${m.otra_sucursal ?? "otro lugar"}`;
        break;
      case "traspaso_entrada":
        detalle = `${piezas} × ${precio} ← ${m.otra_sucursal ?? "otro lugar"}`;
        break;
      case "salida":
        detalle = `${piezas} × ${precio} · ${etiquetaMotivo(m.motivo)}`;
        break;
      default:
        detalle = `${piezas} × ${precio}`;
    }
    lineas.push({
      clave: `m-${m.id}`,
      hora: m.creado_en,
      tipo: m.tipo,
      piezas: m.cantidad,
      detalle,
      usuario: m.usuario_nombre,
      nota: m.nota ?? "",
      existencia,
      // Un ajuste que quita piezas o una salida que no es venta ni traspaso: alguien debe poder explicarla.
      revisar: (m.tipo === "ajuste" && m.cantidad < 0) || m.tipo === "salida",
    });
  }

  return lineas.reverse();
}

const ETIQUETA_TIPO: Record<string, string> = {
  venta: "Venta",
  entrada: "Entrada",
  corte: "Corte",
  ajuste: "Ajuste",
  traspaso_salida: "Traspaso enviado",
  traspaso_entrada: "Traspaso recibido",
  salida: "Salida",
};

/** Nombre legible de un tipo de movimiento; si es uno desconocido, el texto de la base tal cual. */
export function etiquetaTipo(tipo: string): string {
  return ETIQUETA_TIPO[tipo] ?? tipo;
}

/** Una pieza vendida tal como sale de la base (una fila del ledger de tipo 'venta'). */
export interface MovimientoVenta {
  id: number | string;
  creado_en: Date | string;
  /** Día de la venta en hora de México, YYYY-MM-DD. */
  dia: string;
  sucursal_nombre: string;
  usuario_nombre: string;
  precio_mxn: string;
  cantidad: number;
  venta_id: string | null;
}

/** Una venta completa: todas las piezas con el mismo venta_id en una sola línea. */
export interface VentaAgrupada {
  clave: string;
  dia: string;
  hora: Date | string;
  sucursal: string;
  usuario: string;
  piezas: number;
  detalle: string;
}

/**
 * Agrupa las piezas vendidas en ventas. Espera las filas de la más reciente a la más antigua y
 * devuelve las ventas en ese mismo orden. Una pieza sin venta_id (ventas antiguas) cuenta como
 * una venta de una pieza.
 */
export function agruparVentas(movs: MovimientoVenta[]): VentaAgrupada[] {
  const grupos = new Map<string, MovimientoVenta[]>();
  for (const m of movs) {
    const clave = m.venta_id ? `v-${m.venta_id}` : `m-${m.id}`;
    const g = grupos.get(clave);
    if (g) g.push(m);
    else grupos.set(clave, [m]);
  }
  return [...grupos.entries()].map(([clave, g]) => ({
    clave,
    dia: g[0].dia,
    hora: g[0].creado_en,
    sucursal: g[0].sucursal_nombre,
    usuario: g[0].usuario_nombre,
    piezas: g.reduce((t, m) => t + Math.abs(m.cantidad), 0),
    detalle: desglosePorPrecio(g),
  }));
}
