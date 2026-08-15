"use client";

import { useActionState } from "react";
import { crearPrecioAction } from "./actions";

export default function NuevoPrecioForm() {
  const [state, formAction, pending] = useActionState(crearPrecioAction, undefined);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4 sm:flex-row sm:items-end"
    >
      <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
        Precio nuevo para el Almacén (MXN)
        <input
          name="precio_mxn"
          type="number"
          min="1"
          step="0.01"
          required
          placeholder="185.00"
          className="w-40 rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-gold px-6 py-2 font-semibold text-brand-black transition-opacity disabled:opacity-60"
      >
        {pending ? "Agregando..." : "Agregar al Almacén"}
      </button>

      {state?.error && <p className="w-full text-sm text-brand-red">{state.error}</p>}
      {state?.success && <p className="w-full text-sm text-brand-green">{state.success}</p>}
    </form>
  );
}
