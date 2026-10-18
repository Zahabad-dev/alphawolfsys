/**
 * Hora del negocio: México (UTC-6, sin horario de verano desde 2022).
 *
 * El servidor y la base de datos corren en UTC. Las horas GUARDADAS están bien (son
 * instantes absolutos); lo que hay que fijar es en qué zona se MUESTRAN y en cuál se
 * calcula "hoy". Para SQL, la conexión a la base ya trabaja en esta zona (ver db.ts);
 * para mostrar horas en el servidor se usan estos ayudantes, que no dependen de la
 * zona del contenedor.
 */
export const ZONA_HORARIA = "America/Mexico_City";

/** Fecha y hora en hora de México, ej. "12/10/2026, 9:22:00 p.m." */
export function formatearFechaHora(valor: string | Date): string {
  return new Date(valor).toLocaleString("es-MX", { timeZone: ZONA_HORARIA });
}

/** La fecha de HOY en México, como YYYY-MM-DD. */
export function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** El primer día del mes actual en México, como YYYY-MM-DD. */
export function primerDiaDelMes(): string {
  return `${hoyISO().slice(0, 8)}01`;
}

/** Solo la hora en México, ej. "06:45 p. m." */
export function formatearHora(valor: number | string | Date): string {
  return new Date(valor).toLocaleTimeString("es-MX", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
  });
}
