"use client";

import { useActionState } from "react";
import { asignarPrecioAction } from "./actions";

export default function AsignarPrecioForm({
  preciosAlmacen,
  sucursales,
}: {
  preciosAlmacen: number[];
  sucursales: { id: number; nombre: string }[];
}) {
  const [state, formAction, pending] = useActionState(asignarPrecioAction, undefined);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4 sm:flex-row sm:items-end"
    >
      <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
        Precio del Almacén
        <select
          name="precio_mxn"
          required
          className="w-40 rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        >
          <option value="">Selecciona...</option>
          {preciosAlmacen.map((p) => (
            <option key={p} value={p}>
              ${p.toFixed(2)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-1 flex-col gap-1 text-sm text-brand-cream/80">
        Asignar a sucursal
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

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-gold px-6 py-2 font-semibold text-brand-black transition-opacity disabled:opacity-60"
      >
        {pending ? "Asignando..." : "Asignar"}
      </button>

      {state?.error && <p className="w-full text-sm text-brand-red">{state.error}</p>}
      {state?.success && <p className="w-full text-sm text-brand-green">{state.success}</p>}
    </form>
  );
}
