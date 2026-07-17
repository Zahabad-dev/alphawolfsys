"use client";

import { useActionState } from "react";
import { crearLoteAction } from "./actions";

export default function NuevoLoteForm({
  sucursales,
}: {
  sucursales: { id: number; nombre: string }[];
}) {
  const [state, formAction, pending] = useActionState(crearLoteAction, undefined);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4 sm:flex-row sm:items-end"
    >
      <label className="flex flex-1 flex-col gap-1 text-sm text-brand-cream/80">
        Nombre del lote
        <input
          name="nombre"
          type="text"
          required
          placeholder="Lote A - $168"
          className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
        Precio (MXN)
        <input
          name="precio_mxn"
          type="number"
          min="1"
          step="0.01"
          required
          className="w-32 rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
        Sucursal
        <select
          name="sucursal_id"
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

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-gold px-6 py-2 font-semibold text-brand-black transition-opacity disabled:opacity-60"
      >
        {pending ? "Creando..." : "Crear lote"}
      </button>

      {state?.error && <p className="text-sm text-brand-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-green">{state.success}</p>}
    </form>
  );
}
