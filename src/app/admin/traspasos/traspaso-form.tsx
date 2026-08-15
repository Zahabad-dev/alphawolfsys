"use client";

import { useActionState } from "react";
import { registrarTraspasoAction, type RegistrarTraspasoResult } from "./actions";

export default function TraspasoForm({
  lotesAlmacen,
  sucursales,
}: {
  lotesAlmacen: { id: number; etiqueta: string; stock: number }[];
  sucursales: { id: number; nombre: string }[];
}) {
  const [state, formAction, pending] = useActionState<RegistrarTraspasoResult | undefined, FormData>(
    registrarTraspasoAction,
    undefined
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <label className="flex flex-1 flex-col gap-1 text-sm text-brand-cream/80">
        Lote origen (Almacén)
        <select
          name="lote_origen_id"
          required
          className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        >
          <option value="">Selecciona...</option>
          {lotesAlmacen.map((l) => (
            <option key={l.id} value={l.id}>
              {l.etiqueta} — stock: {l.stock}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-1 flex-col gap-1 text-sm text-brand-cream/80">
        Sucursal destino
        <select
          name="sucursal_destino_id"
          required
          className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        >
          <option value="">Selecciona...</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
        Cantidad
        <input
          name="cantidad"
          type="number"
          min="1"
          step="1"
          required
          className="w-28 rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>

      <label className="flex flex-1 flex-col gap-1 text-sm text-brand-cream/80">
        Nota (opcional)
        <input
          name="nota"
          type="text"
          className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-gold px-6 py-2 font-semibold text-brand-black transition-opacity disabled:opacity-60"
      >
        {pending ? "Traspasando..." : "Registrar traspaso"}
      </button>

      {state?.error && <p className="w-full text-sm text-brand-red">{state.error}</p>}
      {state?.success && <p className="w-full text-sm text-brand-green">{state.success}</p>}
    </form>
  );
}
