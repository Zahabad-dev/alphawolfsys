"use client";

import { useActionState, useState } from "react";
import { resolverSolicitudAction, type AjusteResult } from "./actions";

const foco = "focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:outline-none";
const campo = `rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-sm text-brand-cream outline-none focus:border-brand-gold ${foco}`;

/** Autorizar o rechazar una solicitud de ajuste pendiente (solo la administración). */
export default function ResolverForm({ id }: { id: number }) {
  const [comentario, setComentario] = useState("");
  const [password, setPassword] = useState("");
  const [state, formAction, pending] = useActionState<AjusteResult | undefined, FormData>(
    async (prev, formData) => {
      try {
        const resultado = await resolverSolicitudAction(prev, formData);
        if (resultado.success) {
          setComentario("");
          setPassword("");
        }
        return resultado;
      } catch {
        return { error: "No se pudo completar. Revisa tu conexión e inténtalo de nuevo." };
      }
    },
    undefined
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-brand-cream/70">
          Tu comentario (obligatorio si la rechazas)
          <input
            name="comentario_revision"
            type="text"
            maxLength={300}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Ej. Vuelvan a contar el estante y lo revisamos"
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brand-cream/70">
          Tu contraseña (solo para autorizar)
          {/* Hay un formulario por solicitud: "off" evita que el gestor de contraseñas los llene todos. */}
          <input
            name="password"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${campo} w-52`}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          name="decision"
          value="aprobar"
          disabled={pending}
          className={`rounded-full bg-brand-gold px-5 py-2 text-sm font-semibold text-brand-black disabled:opacity-50 ${foco}`}
        >
          Autorizar y aplicar
        </button>
        <button
          type="submit"
          name="decision"
          value="rechazar"
          disabled={pending}
          className={`rounded-full border border-brand-red/60 px-5 py-2 text-sm font-semibold text-brand-red disabled:opacity-50 ${foco}`}
        >
          Rechazar
        </button>
      </div>
      <div aria-live="polite">
        {state?.error && (
          <p role="alert" className="text-sm text-brand-red">
            {state.error}
          </p>
        )}
        {state?.success && <p className="text-sm text-brand-green">{state.success}</p>}
      </div>
    </form>
  );
}
