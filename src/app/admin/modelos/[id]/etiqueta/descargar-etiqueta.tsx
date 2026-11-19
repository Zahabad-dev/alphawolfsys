"use client";

import { useState } from "react";

// Mismas medidas que la etiqueta en pantalla (etiquetas.tsx), a 600 DPI como el QR.
const DPI = 600;
const LETRA_CM = 0.26;
const LETRA_MIN_CM = 0.17;
const PRECIO_CM = 0.19;
const INTERLINEADO = 1.05;
const RENGLONES = 2;
const cmAPx = (cm: number) => Math.round((cm / 2.54) * DPI);

/** Carga una imagen (data: URL) sin depender de img.decode(), que algunas tabletas no tienen. */
function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error("no cargó el QR"));
    img.src = src;
  });
}

/** Parte el texto en renglones que caben en `ancho` (si una palabra sola no cabe, se corta por letras). */
function renglones(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of texto.split(" ")) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width <= ancho) {
      actual = prueba;
      continue;
    }
    if (actual) lineas.push(actual);
    actual = "";
    let resto = palabra;
    while (ctx.measureText(resto).width > ancho && resto.length > 1) {
      let n = resto.length - 1;
      while (n > 1 && ctx.measureText(resto.slice(0, n)).width > ancho) n--;
      lineas.push(resto.slice(0, n));
      resto = resto.slice(n);
    }
    actual = resto;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/**
 * Descarga la etiqueta (QR + modelo + precio) como imagen, con el texto ya dentro del archivo: si se imprime
 * desde otro programa, el texto no se pierde. Se dibuja en el navegador con la misma letra angosta de la
 * pantalla, para que salga igual que al imprimir desde aquí.
 */
export default function DescargarEtiqueta({
  qrSrc,
  ladoCm,
  texto,
  precio,
  familiaLetra,
  nombreArchivo,
}: {
  qrSrc: string;
  ladoCm: number;
  texto: string;
  precio: string | null;
  /** font-family de la letra angosta (next/font). */
  familiaLetra: string;
  nombreArchivo: string;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function descargar(tipo: "png" | "jpg") {
    setOcupado(true);
    setError(null);
    try {
      const escala = ladoCm / 2.12;
      const lado = cmAPx(ladoCm);
      const ancho = cmAPx(ladoCm + 0.1);
      const margen = cmAPx(0.06);
      // Algunas tabletas no tienen document.fonts o rechazan la carga: se sigue con la letra que haya.
      try {
        await document.fonts?.load(`700 ${cmAPx(LETRA_CM * escala)}px ${familiaLetra}`);
      } catch {
        // se ignora a propósito
      }
      const img = await cargarImagen(qrSrc);

      const medir = document.createElement("canvas").getContext("2d")!;
      let tam = cmAPx(LETRA_CM * escala);
      const minimo = cmAPx(LETRA_MIN_CM * escala);
      let lineas: string[];
      for (;;) {
        medir.font = `700 ${tam}px ${familiaLetra}`;
        lineas = renglones(medir, texto, ancho);
        if (lineas.length <= RENGLONES || tam <= minimo) break;
        tam = Math.max(minimo, tam - Math.max(1, cmAPx(0.005 * escala)));
      }
      const alturaTexto = Math.ceil(tam * INTERLINEADO * lineas.length);
      const tamPrecio = cmAPx(PRECIO_CM * escala);
      const alturaPrecio = precio ? Math.ceil(tamPrecio * 1.1) : 0;
      const canvas = document.createElement("canvas");
      canvas.width = ancho + margen * 2;
      canvas.height = margen + lado + margen + alturaTexto + alturaPrecio + margen;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, (canvas.width - lado) / 2, margen, lado, lado);
      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = `700 ${tam}px ${familiaLetra}`;
      let y = margen + lado + margen;
      for (const l of lineas) {
        ctx.fillText(l, canvas.width / 2, y);
        y += tam * INTERLINEADO;
      }
      if (precio) {
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.font = `400 ${tamPrecio}px Arial, sans-serif`;
        ctx.fillText(precio, canvas.width / 2, y);
      }

      const mime = tipo === "png" ? "image/png" : "image/jpeg";
      // Archivo (blob) en vez de data: URL: los navegadores de tableta/Android lo descargan mejor.
      const blob = await new Promise<Blob | null>((ok) =>
        canvas.toBlob ? canvas.toBlob(ok, mime, 0.95) : ok(null)
      );
      const url = blob ? URL.createObjectURL(blob) : canvas.toDataURL(mime, 0.95);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nombreArchivo}.${tipo}`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (blob) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      const detalle = e instanceof Error && e.message ? ` (${e.message})` : "";
      setError(`No se pudo generar la imagen. Inténtalo de nuevo.${detalle}`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 print:hidden">
      <div className="flex gap-3">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => descargar("png")}
          className="rounded-full border border-black/20 px-4 py-1.5 text-sm text-black hover:border-black disabled:opacity-50"
        >
          Descargar PNG (recomendado)
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => descargar("jpg")}
          className="rounded-full border border-black/20 px-4 py-1.5 text-sm text-black/70 hover:border-black disabled:opacity-50"
        >
          Descargar JPG
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
