"use client";

import { useActionState, useState } from "react";
import { eliminarPrecioAction, type EliminarPrecioResult } from "./actions";

export default function EliminarPrecioForm({ id }: { id: number }) {
  const [abierto, setAbierto] = useState(false);
  const [state, formAction, pending] = useActionState<EliminarPrecioResult | undefined, FormData>(
    eliminarPrecioAction,
    undefined
  );

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-sm text-brand-red/80 underline hover:text-brand-red"
      >
        Eliminar
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <div className="flex items-center gap-2">
        <input
          name="password"
          type="password"
          required
          placeholder="Tu contraseña"
          className="w-32 rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream outline-none focus:border-brand-red"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-red px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          {pending ? "..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs text-brand-cream/60 underline"
        >
          Cancelar
        </button>
      </div>
      {state?.error && <p className="max-w-xs text-xs text-brand-red">{state.error}</p>}
      {state?.success && <p className="text-xs text-brand-green">{state.success}</p>}
    </form>
  );
}
