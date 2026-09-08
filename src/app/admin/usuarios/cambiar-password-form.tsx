"use client";

import { useActionState, useState } from "react";
import { cambiarPasswordVendedorAction, type CambiarPasswordResult } from "./actions";

export default function CambiarPasswordForm({
  id,
  username,
}: {
  id: number;
  username: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [state, formAction, pending] = useActionState<CambiarPasswordResult | undefined, FormData>(
    cambiarPasswordVendedorAction,
    undefined
  );

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-sm text-brand-cream/70 underline hover:text-brand-gold"
      >
        Cambiar contraseña
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-xl border border-white/10 bg-brand-black p-3"
    >
      <input type="hidden" name="id" value={id} />
      <p className="text-xs text-brand-cream/70">
        Nueva contraseña para <strong>{username}</strong> (mín. 8 caracteres).
      </p>
      <input
        name="password"
        type="password"
        required
        minLength={8}
        placeholder="Nueva contraseña"
        className="rounded-lg border border-white/10 bg-brand-gray2 px-3 py-1.5 text-sm text-brand-cream outline-none focus:border-brand-gold"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-gold px-4 py-1.5 text-sm font-semibold text-brand-black disabled:opacity-60"
        >
          {pending ? "Guardando..." : "Guardar contraseña"}
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
