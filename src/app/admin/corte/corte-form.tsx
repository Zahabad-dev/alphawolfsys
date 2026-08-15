"use client";

import { useActionState } from "react";
import { registrarCorteAction, type RegistrarCorteResult } from "./actions";

export default function CorteForm({
  lotes,
}: {
  lotes: { id: number; etiqueta: string }[];
}) {
  const [state, formAction, pending] = useActionState<RegistrarCorteResult | undefined, FormData>(
    registrarCorteAction,
    undefined
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4 sm:flex-row sm:items-end"
    >
      <label className="flex flex-1 flex-col gap-1 text-sm text-brand-cream/80">
        Lote (Almacén)
        <select
          name="lote_id"
          required
          className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        >
          <option value="">Selecciona...</option>
          {lotes.map((l) => (
            <option key={l.id} value={l.id}>
              {l.etiqueta}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
        Piezas cortadas
        <input
          name="cantidad"
          type="number"
          min="1"
          step="1"
          required
          className="w-32 rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>

      <label className="flex flex-1 flex-col gap-1 text-sm text-brand-cream/80">
        Nota (ej. tela, fecha de corte)
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
        {pending ? "Registrando..." : "Registrar corte"}
      </button>

      {state?.error && <p className="w-full text-sm text-brand-red">{state.error}</p>}
      {state?.success && <p className="w-full text-sm text-brand-green">{state.success}</p>}
    </form>
  );
}
