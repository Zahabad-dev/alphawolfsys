/**
 * Motivos de un ajuste de inventario. Los valores deben coincidir con el CHECK de
 * sql/012_solicitudes_ajuste.sql.
 */
export const MOTIVOS_AJUSTE = [
  { valor: "error_captura", etiqueta: "Error de captura o de dedo", ayuda: "Se tecleó una cantidad o un precio equivocado" },
  { valor: "error_conteo", etiqueta: "Error de conteo o de inventario", ayuda: "Al contar las piezas no coincide con el sistema" },
  { valor: "mala_instruccion", etiqueta: "Mala instrucción de inventario", ayuda: "Se registró algo que se indicó o entendió mal" },
  { valor: "danada", etiqueta: "Prenda dañada o extraviada", ayuda: "Ya no está o no se puede vender" },
  { valor: "otro", etiqueta: "Otro problema interno", ayuda: "Explícalo bien en el comentario" },
] as const;

export type MotivoAjuste = (typeof MOTIVOS_AJUSTE)[number]["valor"];

export function esMotivoAjuste(valor: unknown): valor is MotivoAjuste {
  return MOTIVOS_AJUSTE.some((m) => m.valor === valor);
}

export function etiquetaMotivoAjuste(valor: string): string {
  return MOTIVOS_AJUSTE.find((m) => m.valor === valor)?.etiqueta ?? valor;
}

/** El comentario tiene que explicar de verdad lo que pasó: ni vacío ni de una palabra. */
export const COMENTARIO_AJUSTE_MIN = 10;
export const COMENTARIO_AJUSTE_MAX = 300;

/** Tope de piezas por ajuste: evita que un error de dedo (un cero de más) llegue a aprobarse. */
export const PIEZAS_AJUSTE_MAX = 100000;

export type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada" | "cancelada";

export const ETIQUETA_ESTADO: Record<EstadoSolicitud, string> = {
  pendiente: "Pendiente",
  aprobada: "Autorizado",
  rechazada: "Rechazado",
  cancelada: "Cancelado",
};

/** Largo en caracteres reales (un emoji cuenta 1), igual que lo mide la base de datos. */
export function largoTexto(texto: string): number {
  return [...texto].length;
}

/**
 * Nota que queda en el movimiento del ledger. Primero van quién pidió y quién autorizó (datos
 * reales) y al final el comentario libre, con los saltos de línea aplanados: así un comentario
 * no puede hacerse pasar por otra persona al leer la nota.
 */
export function notaDeAjuste(args: {
  solicitudId: number;
  motivo: string;
  comentario: string;
  solicito: string;
  autorizo: string;
}): string {
  const quien =
    args.solicito === args.autorizo
      ? `Lo hizo ${args.autorizo}`
      : `Solicitó ${args.solicito} · autorizó ${args.autorizo}`;
  const comentario = args.comentario.replace(/\s+/g, " ").trim();
  return `Ajuste #${args.solicitudId} · ${etiquetaMotivoAjuste(args.motivo)} · ${quien} — Comentario: ${comentario}`;
}

/** Errores esperados de un ajuste (se traducen a un mensaje para la persona; los demás se relanzan). */
export class AjusteError extends Error {
  constructor(
    readonly codigo: "STOCK_INSUFICIENTE" | "STOCK_CAMBIO" | "NO_EXISTE" | "YA_RESUELTA",
    readonly existencia?: number
  ) {
    super(codigo);
    this.name = "AjusteError";
  }
}
