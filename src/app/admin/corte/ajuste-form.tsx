"use client";

import { useActionState } from "react";
import { registrarAjusteAction, type RegistrarAjusteResult } from "./actions";

export default function AjusteForm({
  lotes,
}: {
  lotes: { id: number; etiqueta: string }[];
}) {
  const [state, formAction, pending] = useActionState<RegistrarAjusteResult | undefined, FormData>(
    registrarAjusteAction,
    undefined
  );

  return (
    <details className="rounded-2xl border border-white/10 bg-brand-gray2 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-brand-cream/80">
        Ajustar stock (corrección — solo admin)
      </summary>

      <form action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm text-brand-cream/80">
          Precio (Almacén)
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
          Tipo
          <select
            name="direccion"
            required
            defaultValue="resta"
            className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
          >
            <option value="resta">Restar piezas</option>
            <option value="suma">Sumar piezas</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
          Piezas
          <input
            name="piezas"
            type="number"
            min="1"
            step="1"
            required
            className="w-28 rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm text-brand-cream/80">
          Nota (motivo del ajuste, obligatoria)
          <input
            name="nota"
            type="text"
            required
            placeholder="ej. corte mal capturado, merma de tela"
            className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-full border border-brand-red/60 px-6 py-2 font-semibold text-brand-red transition-opacity disabled:opacity-60"
        >
          {pending ? "Ajustando..." : "Registrar ajuste"}
        </button>

        {state?.error && <p className="w-full text-sm text-brand-red">{state.error}</p>}
        {state?.success && <p className="w-full text-sm text-brand-green">{state.success}</p>}
      </form>
    </details>
  );
}
