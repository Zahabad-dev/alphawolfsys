export function extraerToken(texto: string): string | null {
  try {
    const url = new URL(texto);
    const partes = url.pathname.split("/").filter(Boolean);
    const idx = partes.indexOf("scan");
    if (idx !== -1 && partes[idx + 1]) return partes[idx + 1];
    return partes.at(-1) ?? null;
  } catch {
    // No es una URL completa: asumir que el texto ya es el token.
    return texto.trim() || null;
  }
}
