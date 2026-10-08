"use client";

import { dinero, totalesDe, useCarrito, vaciarCarrito } from "@/lib/carrito";

/** Aviso en el inicio cuando quedó una venta a medias (por ejemplo, se cerró la app). */
export default function VentaEnCurso() {
  const carrito = useCarrito();
  if (carrito.lineas.length === 0) return null;

  const { piezas, total } = totalesDe(carrito.lineas);

  function descartar() {
    if (window.confirm("¿Descartar la venta sin terminar? Se pierde lo que llevaba.")) vaciarCarrito();
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-center text-sm">
      <p className="text-brand-gold">
        Tienes una venta sin terminar: {piezas} {piezas === 1 ? "pieza" : "piezas"} · {dinero(total)}
      </p>
      <div className="mt-2 flex justify-center gap-3">
        {/* Enlace normal (no <Link>) por la misma razón que en el resto del flujo de venta. */}
        <a
          href="/venta/escanear"
          className="rounded-full bg-brand-gold px-4 py-1.5 font-semibold text-brand-black"
        >
          Continuar
        </a>
        <button
          type="button"
          onClick={descartar}
          className="rounded-full border border-white/20 px-4 py-1.5 text-brand-cream/80"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}
