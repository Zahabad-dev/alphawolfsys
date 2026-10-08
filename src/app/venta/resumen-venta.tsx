"use client";

import { dinero, totalesDe, type LineaCarrito } from "@/lib/carrito";

/**
 * Lista de precios de la venta en curso con piezas, subtotal y total general.
 * `pendiente` es el conteo que aún no se agrega al carrito (se muestra punteado
 * para que el total que ve el vendedor ya incluya lo que está contando).
 */
export default function ResumenVenta({
  lineas,
  pendiente,
  onQuitar,
}: {
  lineas: LineaCarrito[];
  pendiente?: { precio: number; cantidad: number } | null;
  onQuitar?: (idLinea: string) => void;
}) {
  const todas: { precio: number; cantidad: number }[] = lineas.map((l) => ({
    precio: l.precio,
    cantidad: l.cantidad,
  }));
  if (pendiente && pendiente.cantidad > 0) todas.push(pendiente);
  const { piezas, total } = totalesDe(todas);

  if (todas.length === 0) return null;

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-brand-gray2 p-3 text-sm">
      <p className="mb-2 text-xs uppercase tracking-wide text-brand-cream/50">Venta en curso</p>
      <ul className="flex flex-col gap-1.5">
        {lineas.map((l) => (
          <li
            key={l.id}
            className="flex items-center justify-between gap-2 rounded-lg bg-brand-black/60 px-3 py-1.5"
          >
            <span className="text-brand-cream">
              {dinero(l.precio)} × {l.cantidad}
            </span>
            <span className="flex items-center gap-3">
              <span className="text-brand-gold">{dinero(l.precio * l.cantidad)}</span>
              {onQuitar && (
                <button
                  type="button"
                  onClick={() => onQuitar(l.id)}
                  aria-label={`Quitar ${dinero(l.precio)} × ${l.cantidad}`}
                  className="rounded-full border border-white/15 px-2 text-xs text-brand-cream/60 hover:border-brand-red hover:text-brand-red"
                >
                  ✕
                </button>
              )}
            </span>
          </li>
        ))}
        {pendiente && pendiente.cantidad > 0 && (
          <li className="flex items-center justify-between rounded-lg border border-dashed border-brand-gold/50 px-3 py-1.5">
            <span className="text-brand-cream/80">
              {dinero(pendiente.precio)} × {pendiente.cantidad}{" "}
              <span className="text-xs text-brand-cream/50">(contando)</span>
            </span>
            <span className="text-brand-gold/80">{dinero(pendiente.precio * pendiente.cantidad)}</span>
          </li>
        )}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2">
        <span className="text-brand-cream/70">
          {piezas} {piezas === 1 ? "pieza" : "piezas"}
        </span>
        <span className="text-lg font-bold text-brand-gold">{dinero(total)}</span>
      </div>
    </div>
  );
}
