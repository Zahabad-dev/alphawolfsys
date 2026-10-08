"use client";

import { dinero } from "@/lib/carrito";
import type { EnvioResultado } from "./enviar-venta";

/** Pantalla final: venta registrada, o guardada en el celular si no había señal. */
export default function ResultadoVenta({
  resultado,
}: {
  resultado: Extract<EnvioResultado, { tipo: "registrada" | "guardada-local" }>;
}) {
  const local = resultado.tipo === "guardada-local";

  return (
    <div
      className={`flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border p-8 text-center ${
        local ? "border-yellow-500/40 bg-yellow-500/10" : "border-white/10 bg-brand-gray2"
      }`}
    >
      <p className={`text-xl ${local ? "text-yellow-500" : "text-brand-gold"}`}>
        {local ? "Guardada en el celular" : "Venta registrada"}
      </p>

      <ul className="flex w-full flex-col gap-1 text-brand-cream">
        {resultado.lineas.map((l, i) => (
          <li key={i} className="flex justify-between text-sm">
            <span>
              {l.cantidad} × {dinero(l.precio)}
            </span>
            <span>{dinero(l.cantidad * l.precio)}</span>
          </li>
        ))}
      </ul>
      <p className="w-full border-t border-white/10 pt-3 text-brand-cream">
        {resultado.piezas} {resultado.piezas === 1 ? "pieza" : "piezas"} ·{" "}
        <span className="font-bold text-brand-gold">{dinero(resultado.total)}</span>
      </p>

      {local && (
        <p className="text-sm text-brand-cream/70">
          Sin señal ahora mismo — se va a sincronizar sola en cuanto haya conexión, no hace falta
          que hagas nada más.
        </p>
      )}

      <a
        href="/venta/escanear"
        className="mt-2 rounded-full bg-brand-gold px-6 py-2 font-semibold text-brand-black"
      >
        Nueva venta
      </a>
    </div>
  );
}
