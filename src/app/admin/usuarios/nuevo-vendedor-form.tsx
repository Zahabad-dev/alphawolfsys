"use client";

import { useActionState, useState } from "react";
import { crearVendedorAction, type CrearVendedorResult } from "./actions";

export default function NuevoVendedorForm({
  sucursales,
}: {
  sucursales: { id: number; nombre: string }[];
}) {
  const [state, formAction, pending] = useActionState<CrearVendedorResult | undefined, FormData>(
    crearVendedorAction,
    undefined
  );
  const [rol, setRol] = useState<"vendedor" | "gerente" | "soporte">("vendedor");

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
        Rol
        <select
          name="rol"
          value={rol}
          onChange={(e) => setRol(e.target.value as "vendedor" | "gerente" | "soporte")}
          className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        >
          <option value="vendedor">Vendedor (una sucursal)</option>
          <option value="gerente">Gerente (todas, sin borrar nada)</option>
          <option value="soporte">Soporte (solo bandeja de errores)</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
        Usuario
        <input
          name="username"
          type="text"
          required
          className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
        Nombre
        <input
          name="nombre"
          type="text"
          required
          className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
        Contraseña inicial
        <input
          name="password"
          type="text"
          required
          minLength={8}
          placeholder="mín. 8 caracteres"
          className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>

      {rol === "vendedor" && (
        <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
          Sucursal
          <select
            name="sucursal_id"
            required
            className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
          >
            <option value="">Selecciona...</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-gold px-6 py-2 font-semibold text-brand-black transition-opacity disabled:opacity-60"
      >
        {pending
          ? "Creando..."
          : rol === "gerente"
            ? "Crear gerente"
            : rol === "soporte"
              ? "Crear usuario de soporte"
              : "Crear vendedor"}
      </button>

      {state?.error && <p className="w-full text-sm text-brand-red">{state.error}</p>}
      {state?.success && <p className="w-full text-sm text-brand-green">{state.success}</p>}
    </form>
  );
}
