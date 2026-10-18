"use client";

import { useActionState, useState } from "react";
import { desbloquearCifrasAction, type DesbloqueoResult } from "./candado-actions";

/** Lo que se ve mientras las cifras están ocultas: un botón y, al tocarlo, la contraseña. */
export default function CandadoCifras() {
  const [abierto, setAbierto] = useState(false);
  const [state, formAction, pending] = useActionState<DesbloqueoResult | undefined, FormData>(
    desbloquearCifrasAction,
    undefined
  );

  return (
    <section
      aria-label="Cifras ocultas"
      className="flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-5"
    >
      <div>
        <p className="font-semibold text-brand-cream">Las cifras están ocultas</p>
        <p className="mt-1 text-sm text-brand-cream/60">
          Ventas, totales y comparativos solo se ven con la contraseña de administración.
        </p>
      </div>

      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="rounded-full bg-brand-gold px-5 py-2 text-sm font-semibold text-brand-black"
        >
          Mostrar cifras
        </button>
      ) : (
        <form action={formAction} className="flex w-full flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
            Contraseña de administración
            <input
              name="password"
              type="password"
              required
              autoFocus
              autoComplete="off"
              className="w-56 rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-brand-gold px-5 py-2 text-sm font-semibold text-brand-black disabled:opacity-60"
          >
            {pending ? "Verificando..." : "Mostrar"}
          </button>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-brand-cream/70"
          >
            Cancelar
          </button>
          {state?.error && <p className="w-full text-sm text-brand-red">{state.error}</p>}
        </form>
      )}
    </section>
  );
}
