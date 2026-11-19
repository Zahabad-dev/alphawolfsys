"use client";

import { useLayoutEffect, useRef } from "react";

const LETRA_CM = 0.26;
const LETRA_MIN_CM = 0.17;
const RENGLONES = 2;
const INTERLINEADO = 1.05;

/**
 * Etiquetas nuevas: QR + texto del modelo (+ precio). El texto usa letra angosta y, si no cabe en 2
 * renglones, se achica solo hasta un mínimo para que se siga leyendo. Se mide una vez y el tamaño se
 * aplica a todas las copias (todas llevan el mismo texto).
 */
export default function Etiquetas({
  qrSrc,
  ladoCm,
  texto,
  precio,
  copias,
  claseLetra,
}: {
  qrSrc: string;
  ladoCm: number;
  texto: string;
  /** "$350.00 · ALM", o null mientras no haya precio. */
  precio: string | null;
  copias: number;
  claseLetra: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const muestra = useRef<HTMLParagraphElement>(null);
  const anchoCm = ladoCm + 0.1;
  // Proporcional al tamaño del QR (en 2 cm, la letra base es 0.26 cm).
  const escala = ladoCm / 2.12;

  useLayoutEffect(() => {
    const el = muestra.current;
    const caja = contenedor.current;
    if (!el || !caja) return;
    let cancelado = false;
    const medir = () => {
      if (cancelado) return;
      let tam = LETRA_CM * escala;
      const minimo = LETRA_MIN_CM * escala;
      // Alto real (sin redondear a px), con medio renglón de margen: un tercer renglón nunca cabe.
      const cabe = () =>
        el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).fontSize) * INTERLINEADO * (RENGLONES + 0.5);
      el.style.fontSize = `${tam}cm`;
      while (!cabe() && tam > minimo) {
        tam = Math.max(minimo, tam - 0.005 * escala);
        el.style.fontSize = `${tam}cm`;
      }
      caja.style.setProperty("--letra-etiqueta", `${tam}cm`);
    };
    medir();
    // La letra angosta puede terminar de cargar después: se vuelve a medir con la letra real.
    document.fonts?.ready.then(medir);
    return () => {
      cancelado = true;
    };
  }, [texto, escala]);

  const etiqueta = (i: number, medir: boolean) => (
    <div key={i} className="flex flex-col items-center text-center" style={{ width: `${anchoCm}cm` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrSrc} alt={i === 0 ? `QR ${texto}` : ""} style={{ width: `${ladoCm}cm`, height: `${ladoCm}cm` }} />
      <p
        ref={medir ? muestra : undefined}
        className={`${claseLetra} w-full font-bold uppercase text-black`}
        style={{ fontSize: "var(--letra-etiqueta)", lineHeight: INTERLINEADO, overflowWrap: "anywhere", marginTop: "0.06cm" }}
      >
        {texto}
      </p>
      <p className="text-black/80" style={{ fontSize: `${0.19 * escala}cm`, lineHeight: 1.1 }}>
        {precio ?? "$ —"}
      </p>
    </div>
  );

  return (
    <div
      ref={contenedor}
      className="grid w-full justify-center gap-x-3 gap-y-4 print:gap-x-2 print:gap-y-3"
      style={{ gridTemplateColumns: `repeat(auto-fill, ${anchoCm}cm)`, ["--letra-etiqueta" as string]: `${LETRA_CM * escala}cm` }}
    >
      {Array.from({ length: copias }, (_, i) => etiqueta(i, i === 0))}
    </div>
  );
}
