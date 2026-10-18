"use client";

import { useActionState } from "react";
import { registrarAjusteAction, type RegistrarAjusteResult } from "./actions";

export default function AjusteForm({
  lotes,
  loteInicial,
}: {
  lotes: { id: number; etiqueta: string }[];
  /** Si viene (botón "Ajustar" de un renglón), el formulario se abre con ese lugar y precio elegidos. */
  loteInicial?: number;
}) {
  const [state, formAction, pending] = useActionState<RegistrarAjusteResult | undefined, FormData>(
    registrarAjusteAction,
    undefined
  );

  return (
    <details
      id="ajuste"
      open={loteInicial ? true : undefined}
      className="rounded-xl border border-white/10 bg-brand-black/40 px-3 py-2"
    >
      <summary className="cursor-pointer text-sm text-brand-cream/80">
        Ajustar stock (corrección — solo administración)
      </summary>

      <p className="mt-3 text-xs text-brand-cream/60">
        Resta o suma piezas del lugar y precio que elijas. Queda registrado a tu nombre, con la nota
        y con tu contraseña.
      </p>

      <form action={formAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm text-brand-cream/80">
          Lugar y precio
          <select
            name="lote_id"
            required
            defaultValue={loteInicial ?? ""}
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
            placeholder="ej. 194 eran de $160, ya registradas · autorizó [nombre] por WhatsApp"
            className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
          Tu contraseña
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-44 rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
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
