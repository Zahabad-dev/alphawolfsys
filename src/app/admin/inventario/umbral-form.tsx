"use client";

import { useActionState } from "react";
import { actualizarUmbralAction } from "./actions";

export default function UmbralForm({
  id,
  umbralActual,
}: {
  id: number;
  umbralActual: number;
}) {
  const [state, formAction, pending] = useActionState(actualizarUmbralAction, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="umbral_stock"
        type="number"
        min="0"
        step="1"
        required
        defaultValue={umbralActual}
        className="w-20 rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream outline-none focus:border-brand-gold"
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
