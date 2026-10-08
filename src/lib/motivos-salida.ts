/**
 * Motivos por los que una prenda sale del inventario SIN ser una venta.
 * Los valores deben coincidir con el CHECK de sql/011_salidas.sql.
 */
export const MOTIVOS_SALIDA = [
  { valor: "regalo", etiqueta: "Regalo", ayuda: "Obsequio a un cliente" },
  { valor: "saldo", etiqueta: "Saldo", ayuda: "Se manda a saldos o liquidación" },
  { valor: "merma", etiqueta: "Dañada o merma", ayuda: "Prenda dañada, manchada o defectuosa" },
  { valor: "muestra", etiqueta: "Muestra", ayuda: "Muestra para un cliente o prospecto" },
  { valor: "otro", etiqueta: "Otro", ayuda: "Otro motivo (escribe cuál)" },
] as const;

export type MotivoSalida = (typeof MOTIVOS_SALIDA)[number]["valor"];

export function esMotivoSalida(valor: unknown): valor is MotivoSalida {
  return MOTIVOS_SALIDA.some((m) => m.valor === valor);
}

export function etiquetaMotivo(valor: string | null | undefined): string {
  return MOTIVOS_SALIDA.find((m) => m.valor === valor)?.etiqueta ?? "";
}

/** Largo máximo de la nota de una salida. */
export const NOTA_SALIDA_MAX = 200;
