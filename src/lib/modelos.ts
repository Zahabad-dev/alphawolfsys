/**
 * Reglas del catálogo de modelos. Sin acceso a la base: se usan igual en la pantalla (aviso en vivo de
 * modelos parecidos) y en el servidor (validación final).
 */

export const NOMBRE_MODELO_MIN = 3;
export const NOMBRE_MODELO_MAX = 120;
export const CODIGO_MODELO_MAX = 20;
export const TALLAS_POR_MODELO_MAX = 50;

/** Caracteres invisibles o de control que no deben quedar en un nombre (se ven igual pero no lo son). */
const INVISIBLES = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const ACENTOS = /[\u0300-\u036f]/g;

/** Como se guarda y se muestra: sin caracteres invisibles, espacios normalizados y en mayúsculas. */
export function limpiarNombreModelo(nombre: string): string {
  return nombre.replace(INVISIBLES, "").replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * Clave para detectar el MISMO modelo escrito distinto: sin acentos, sin paréntesis ni signos sueltos,
 * con la diagonal pegada ("M / L" = "M/L"), mayúsculas y espacios únicos.
 * "Camisa  cuadro franela (rojo)" y "CAMISA CUADRO FRANELA ROJO" tienen la misma clave.
 */
export function claveModelo(nombre: string): string {
  return nombre
    .replace(INVISIBLES, "")
    .normalize("NFD")
    .replace(ACENTOS, "")
    .toUpperCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/[^A-Z0-9/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** El nombre trae al menos 3 letras o números (no vale "///" ni "---"). */
export function nombreSuficiente(nombre: string): boolean {
  return claveModelo(nombre).replace(/[^A-Z0-9]/g, "").length >= NOMBRE_MODELO_MIN;
}

/** Código opcional: mayúsculas, números y guiones. Vacío = sin código. */
export function limpiarCodigo(codigo: string): string {
  return codigo.replace(INVISIBLES, "").trim().toUpperCase().replace(/\s+/g, "-");
}

export function codigoValido(codigo: string): boolean {
  return codigo === "" || new RegExp(`^[A-Z0-9-]{1,${CODIGO_MODELO_MAX}}$`).test(codigo);
}

/** Talla nueva: letras, números y . / -, máximo 10, con al menos una letra o número (ej. 4XL, 28, 10-12). */
export function limpiarTalla(talla: string): string {
  return talla.replace(INVISIBLES, "").trim().toUpperCase().replace(/\s+/g, "");
}

export function tallaValida(talla: string): boolean {
  return /^[A-Z0-9/.-]{1,10}$/.test(talla) && /[A-Z0-9]/.test(talla);
}

/** Palabras de un nombre en singular aproximado ("CUADROS" → "CUADRO"). "M/L" queda como una sola palabra. */
function palabras(nombre: string): string[] {
  return claveModelo(nombre)
    .split(" ")
    .filter(Boolean)
    .map((p) => (p.includes("/") ? p : p.length > 4 && p.endsWith("ES") ? p.slice(0, -2) : p.length > 3 && p.endsWith("S") ? p.slice(0, -1) : p));
}

/** Cuántas letras hay que cambiar para pasar de `a` a `b` (para detectar errores de dedo). */
function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const actual = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = actual;
    }
  }
  return fila[b.length];
}

/**
 * ¿Puede ser el mismo modelo escrito distinto? Sí cuando:
 *  - tienen exactamente las mismas palabras (en cualquier orden, ignorando plurales y signos):
 *    "CAMISA CUADRO FRANELA" = "CAMISA CUADROS FRANELA", o
 *  - solo una palabra cambia y es un error de dedo (hasta 2 letras, en palabras de 5 o más):
 *    "FRANELA" / "FRANLEA".
 * NO lo es cuando cambia la manga ("M/L" vs "M/C") o el color ("ROJO" vs "AZUL"): son modelos distintos.
 */
export function mismoModeloProbable(a: string, b: string): boolean {
  const A = new Set(palabras(a));
  const B = new Set(palabras(b));
  const soloA = [...A].filter((p) => !B.has(p));
  const soloB = [...B].filter((p) => !A.has(p));
  if (!soloA.length && !soloB.length) return A.size > 0;
  if (soloA.length !== 1 || soloB.length !== 1) return false;
  const [x, y] = [soloA[0], soloB[0]];
  if (x.includes("/") || y.includes("/") || x.length < 5 || y.length < 5) return false;
  return distancia(x, y) <= 2;
}

/** Modelos del catálogo que podrían ser el mismo que `nombre` (sin contar el que se está editando). */
export function modelosParecidos<T extends { id: number; nombre: string }>(nombre: string, catalogo: T[], excluirId?: number): T[] {
  if (!nombreSuficiente(nombre)) return [];
  return catalogo.filter((m) => m.id !== excluirId && mismoModeloProbable(nombre, m.nombre));
}
