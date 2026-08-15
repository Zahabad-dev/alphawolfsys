"use client";

import { useActionState } from "react";
import { crearSucursalAction, type CrearSucursalResult } from "./actions";

export default function NuevaSucursalForm() {
  const [state, formAction, pending] = useActionState<CrearSucursalResult | undefined, FormData>(
    crearSucursalAction,
    undefined
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4 sm:flex-row sm:items-end"
    >
      <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
        Clave
        <input
          name="clave"
          type="text"
          required
          placeholder="MOR"
          maxLength={10}
          className="w-28 rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>

      <label className="flex flex-1 flex-col gap-1 text-sm text-brand-cream/80">
        Nombre
        <input
          name="nombre"
          type="text"
          required
          placeholder="Sucursal Moroleón"
          className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>

      <label className="flex flex-1 flex-col gap-1 text-sm text-brand-cream/80">
        Estado
        <input
          name="estado"
          type="text"
          required
          placeholder="Guanajuato"
          className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-gold px-6 py-2 font-semibold text-brand-black transition-opacity disabled:opacity-60"
      >
        {pending ? "Creando..." : "Crear sucursal"}
      </button>

      {state?.error && <p className="w-full text-sm text-brand-red">{state.error}</p>}
      {state?.success && <p className="w-full text-sm text-brand-green">{state.success}</p>}
    </form>
  );
}
