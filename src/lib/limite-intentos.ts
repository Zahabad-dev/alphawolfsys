/**
 * Freno a las contraseñas equivocadas en las pantallas que piden la contraseña para confirmar
 * (ajustes de inventario). Tras 5 fallos seguidos en 15 minutos, esa cuenta queda bloqueada 15 minutos.
 *
 * Vive en la memoria del servidor: sirve contra quien prueba contraseñas sin parar en una tablet
 * olvidada, pero se reinicia al volver a desplegar. El login general tiene su propio plan aparte
 * (ver el plan de seguridad).
 */
const MAX_FALLOS = 5;
const VENTANA_MS = 15 * 60 * 1000;
const BLOQUEO_MS = 15 * 60 * 1000;

interface Registro {
  fallos: number;
  desde: number;
  bloqueadoHasta: number;
}

const registros = new Map<number, Registro>();

/** Minutos que faltan para poder intentar de nuevo; 0 si no está bloqueada. */
export function minutosDeBloqueo(usuarioId: number): number {
  const r = registros.get(usuarioId);
  const ahora = Date.now();
  if (!r || r.bloqueadoHasta <= ahora) return 0;
  return Math.ceil((r.bloqueadoHasta - ahora) / 60000);
}

export function registrarFallo(usuarioId: number): void {
  const ahora = Date.now();
  let r = registros.get(usuarioId);
  if (!r || ahora - r.desde > VENTANA_MS) {
    r = { fallos: 0, desde: ahora, bloqueadoHasta: 0 };
    registros.set(usuarioId, r);
  }
  r.fallos += 1;
  if (r.fallos >= MAX_FALLOS) {
    r.bloqueadoHasta = ahora + BLOQUEO_MS;
    r.fallos = 0;
    r.desde = ahora;
  }
}

export function limpiarFallos(usuarioId: number): void {
  registros.delete(usuarioId);
}
