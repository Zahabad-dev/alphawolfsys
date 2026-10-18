/** Formatos de número para pantallas (seguros para usar en componentes de servidor). */

/** Dinero en pesos: $1,234.50 */
export function dinero(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Entero con separador de miles: 3,543 */
export function miles(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
}

/** Dinero sin centavos para totales grandes: $7,088,105 */
export function dineroEntero(n: number): string {
  return `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}
