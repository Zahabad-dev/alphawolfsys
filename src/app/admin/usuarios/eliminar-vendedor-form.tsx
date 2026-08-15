"use client";

import { useActionState, useState } from "react";
import { eliminarVendedorAction, type EliminarVendedorResult } from "./actions";

export default function EliminarVendedorForm({
  id,
  username,
}: {
  id: number;
  username: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [state, formAction, pending] = useActionState<EliminarVendedorResult | undefined, FormData>(
    eliminarVendedorAction,
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
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-xl border border-brand-red/40 bg-brand-black p-3"
    >
      <input type="hidden" name="id" value={id} />
      <p className="text-xs text-brand-cream/70">
        Escribe exactamente <strong>{username}</strong> y tu contraseña para confirmar. Si ya
        tiene ventas registradas, no se podrá eliminar (usa desactivar en su lugar).
      </p>
      <input
        name="username_confirmacion"
        type="text"
        required
        placeholder={username}
        className="rounded-lg border border-white/10 bg-brand-gray2 px-3 py-1.5 text-sm text-brand-cream outline-none focus:border-brand-red"
      />
      <input
        name="password"
        type="password"
        required
        placeholder="Tu contraseña"
        className="rounded-lg border border-white/10 bg-brand-gray2 px-3 py-1.5 text-sm text-brand-cream outline-none focus:border-brand-red"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-red px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Eliminando..." : "Confirmar eliminación"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-brand-cream/70"
        >
          Cancelar
        </button>
      </div>
      {state?.error && <p className="text-xs text-brand-red">{state.error}</p>}
      {state?.success && <p className="text-xs text-brand-green">{state.success}</p>}
    </form>
  );
}
