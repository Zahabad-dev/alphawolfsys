"use client";

import { useActionState } from "react";
import { cancelarSolicitudAction, type AjusteResult } from "./actions";

/** La gerente retira su propia solicitud pendiente. Avisa si ya no se pudo y evita el doble clic. */
export default function RetirarForm({ id }: { id: number }) {
  const [state, formAction, pending] = useActionState<AjusteResult | undefined, FormData>(
    async (prev, formData) => {
      try {
        return await cancelarSolicitudAction(prev, formData);
      } catch {
        return { error: "No se pudo retirar. Inténtalo de nuevo." };
      }
    },
    undefined
  );
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm text-brand-cream/70 underline hover:text-brand-gold focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:outline-none disabled:opacity-50"
      >
        {pending ? "Retirando…" : "Retirar mi solicitud"}
      </button>
      <div aria-live="polite">
        {state?.error && (
          <p role="alert" className="text-sm text-brand-red">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
