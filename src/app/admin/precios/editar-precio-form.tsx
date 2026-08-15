"use client";

import { useActionState } from "react";
import { actualizarPrecioAction } from "./actions";

export default function EditarPrecioForm({
  id,
  precioActual,
}: {
  id: number;
  precioActual: number;
}) {
  const [state, formAction, pending] = useActionState(actualizarPrecioAction, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-brand-cream/50">$</span>
      <input
        name="precio_mxn"
        type="number"
        min="1"
        step="0.01"
        required
        defaultValue={precioActual}
        className="w-24 rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream outline-none focus:border-brand-gold"
      />
      <button
        type="submit"
        disabled={pending}
        className="text-sm text-brand-gold underline disabled:opacity-60"
      >
        {pending ? "..." : "Guardar"}
      </button>
      {state?.error && <span className="text-xs text-brand-red">{state.error}</span>}
    </form>
  );
}
