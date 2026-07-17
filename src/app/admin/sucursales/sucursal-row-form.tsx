"use client";

import { useActionState } from "react";
import { actualizarSucursalAction, type ActualizarSucursalResult } from "./actions";

export default function SucursalRowForm({
  id,
  nombre,
  estado,
}: {
  id: number;
  nombre: string;
  estado: string;
}) {
  const [state, formAction, pending] = useActionState<
    ActualizarSucursalResult | undefined,
    FormData
  >(actualizarSucursalAction, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1 text-xs text-brand-cream/60">
        Nombre
        <input
          name="nombre"
          type="text"
          defaultValue={nombre}
          required
          className="rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-brand-cream/60">
        Estado
        <input
          name="estado"
          type="text"
          defaultValue={estado}
          required
          className="rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-gold px-4 py-1 text-sm font-semibold text-brand-black disabled:opacity-60"
      >
        {pending ? "Guardando..." : "Guardar"}
      </button>
      {state?.success && <span className="text-xs text-brand-green">{state.success}</span>}
      {state?.error && <span className="text-xs text-brand-red">{state.error}</span>}
    </form>
  );
}
