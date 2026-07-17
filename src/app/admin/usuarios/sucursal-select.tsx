"use client";

import { reasignarSucursalAction } from "./actions";

export default function SucursalSelect({
  usuarioId,
  sucursalIdActual,
  sucursales,
}: {
  usuarioId: number;
  sucursalIdActual: number;
  sucursales: { id: number; nombre: string }[];
}) {
  return (
    <form
      action={reasignarSucursalAction}
      onChange={(e) => e.currentTarget.requestSubmit()}
    >
      <input type="hidden" name="id" value={usuarioId} />
      <select
        name="sucursal_id"
        defaultValue={sucursalIdActual}
        className="rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream outline-none focus:border-brand-gold"
      >
        {sucursales.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </select>
    </form>
  );
}
