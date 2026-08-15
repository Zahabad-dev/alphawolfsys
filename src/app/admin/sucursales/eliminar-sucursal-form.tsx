"use client";

import { useActionState, useState } from "react";
import { eliminarSucursalAction, type EliminarSucursalResult } from "./actions";

export default function EliminarSucursalForm({
  id,
  nombre,
  vendedores,
  otrasSucursales,
}: {
  id: number;
  nombre: string;
  vendedores: string[];
  otrasSucursales: { id: number; nombre: string }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [accion, setAccion] = useState<"reasignar" | "eliminar">("reasignar");
  const [state, formAction, pending] = useActionState<EliminarSucursalResult | undefined, FormData>(
    eliminarSucursalAction,
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
        Esto también elimina todos los precios (QR) y el historial de movimientos de{" "}
        <strong>{nombre}</strong>. No se puede deshacer.
      </p>

      {vendedores.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-2">
          <p className="text-xs text-brand-cream/70">
            Tiene {vendedores.length} vendedor(es) asignado(s): {vendedores.join(", ")}. ¿Qué
            hacer con ellos?
          </p>
          <label className="flex items-center gap-2 text-xs text-brand-cream/80">
            <input
              type="radio"
              name="accion_vendedores"
              value="reasignar"
              checked={accion === "reasignar"}
              onChange={() => setAccion("reasignar")}
            />
            Reasignarlos a:
            <select
              name="sucursal_destino_id"
              disabled={accion !== "reasignar"}
              className="rounded-lg border border-white/10 bg-brand-gray2 px-2 py-1 text-xs text-brand-cream disabled:opacity-40"
            >
              <option value="">Selecciona...</option>
              {otrasSucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-brand-cream/80">
            <input
              type="radio"
              name="accion_vendedores"
              value="eliminar"
              checked={accion === "eliminar"}
              onChange={() => setAccion("eliminar")}
            />
            Eliminar también sus cuentas (falla si ya tienen ventas registradas)
          </label>
        </div>
      )}

      <input
        name="nombre_confirmacion"
        type="text"
        required
        placeholder={nombre}
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
