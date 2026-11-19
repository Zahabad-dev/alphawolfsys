"use client";

import { startTransition, useActionState, useState } from "react";
import { NOTA_PRECIO_MAX, leerPrecio } from "@/lib/modelos";
import { dinero } from "@/lib/formato";
import { ponerPrecioModeloAction, quitarPrecioModeloAction, type PrecioModeloResult } from "./actions";

const foco = "focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:outline-none";
const campo = `rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-sm text-brand-cream outline-none focus:border-brand-gold ${foco}`;

export interface SucursalPrecio {
  id: number;
  nombre: string;
  clave: string;
  esAlmacen: boolean;
  /** Precio vigente del modelo en esta sucursal, o null si no tiene. */
  vigente: number | null;
  /** Precios que la sucursal ya maneja en Precios (las etiquetas de hoy). */
  preciosSucursal: number[];
}

/** Poner o cambiar el precio del modelo en varias sucursales a la vez. */
export function PrecioForm({ modeloId, sucursales }: { modeloId: number; sucursales: SucursalPrecio[] }) {
  const [precio, setPrecio] = useState("");
  const [elegidas, setElegidas] = useState<number[]>([]);
  const [nota, setNota] = useState("");
  const [cambiadoTrasEnvio, setCambiadoTrasEnvio] = useState(false);

  const [state, formAction, pending] = useActionState<PrecioModeloResult | undefined, FormData>(async (prev, formData) => {
    try {
      const r = await ponerPrecioModeloAction(prev, formData);
      startTransition(() => {
        setCambiadoTrasEnvio(false);
        if (r.cambio) {
          setPrecio("");
          setElegidas([]);
          setNota("");
        }
      });
      return r;
    } catch {
      return { error: "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo." };
    }
  }, undefined);

  const cambia = (fn: () => void) => {
    fn();
    setCambiadoTrasEnvio(true);
  };
  const valor = leerPrecio(precio);
  // Sucursales marcadas que no manejan ese precio en Precios (hoy el inventario se cuenta por precio).
  const sinEsePrecio = valor === null ? [] : sucursales.filter((s) => elegidas.includes(s.id) && !s.preciosSucursal.includes(valor));
  const sugeridos = [...new Set(sucursales.flatMap((s) => s.preciosSucursal))].sort((a, b) => a - b);
  const faltan: string[] = [];
  if (valor === null) faltan.push("el precio");
  if (!elegidas.length) faltan.push("al menos una sucursal");
  const mostrar = !cambiadoTrasEnvio && !pending;

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-brand-gray2 p-4 sm:p-5">
      <input type="hidden" name="modelo_id" value={modeloId} />
      {elegidas.map((id) => (
        <input key={id} type="hidden" name="sucursal" value={id} />
      ))}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-40 flex-col gap-1 text-xs text-brand-cream/70">
          Precio (pesos)
          <input
            name="precio"
            type="text"
            inputMode="decimal"
            required
            value={precio}
            onChange={(e) => cambia(() => setPrecio(e.target.value))}
            placeholder="Ej. 350"
            className={campo}
          />
        </label>
        {sugeridos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pb-1 text-xs text-brand-cream/70">
            <span>Precios que ya manejan:</span>
            {sugeridos.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => cambia(() => setPrecio(String(p)))}
                className={`rounded-full border px-2 py-0.5 ${valor === p ? "border-brand-gold text-brand-gold" : "border-white/10 hover:border-brand-gold/60"} ${foco}`}
              >
                {dinero(p)}
              </button>
            ))}
          </div>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs text-brand-cream/70">¿En qué sucursales?</legend>
        <div className="flex flex-wrap gap-2">
          {sucursales.map((s) => {
            const marcada = elegidas.includes(s.id);
            return (
              <label
                key={s.id}
                className={`flex cursor-pointer flex-col rounded-xl border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-brand-gold ${
                  marcada ? "border-brand-gold bg-brand-gold/15 text-brand-gold" : "border-white/10 text-brand-cream/80 hover:border-brand-gold/60"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={marcada}
                  onChange={() => cambia(() => setElegidas((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id])))}
                />
                <span className="font-semibold">{s.nombre}</span>
                <span className="text-xs text-brand-cream/70">{s.vigente === null ? "sin precio" : `ahora ${dinero(s.vigente)}`}</span>
              </label>
            );
          })}
        </div>
        <div className="flex gap-3 text-xs">
          <button type="button" onClick={() => cambia(() => setElegidas(sucursales.map((s) => s.id)))} className={`text-brand-cream/70 underline hover:text-brand-gold ${foco}`}>
            Todas
          </button>
          <button type="button" onClick={() => cambia(() => setElegidas([]))} className={`text-brand-cream/70 underline hover:text-brand-gold ${foco}`}>
            Ninguna
          </button>
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-xs text-brand-cream/70">
        Nota (opcional): por qué se pone o cambia
        <input
          name="nota"
          type="text"
          maxLength={NOTA_PRECIO_MAX}
          value={nota}
          onChange={(e) => cambia(() => setNota(e.target.value))}
          placeholder="Ej. aumento del proveedor"
          className={campo}
        />
      </label>

      <div role="status" aria-live="polite">
        {sinEsePrecio.length > 0 && valor !== null && (
          <p className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-brand-cream">
            {sinEsePrecio.map((s) => s.nombre).join(", ")} todavía no {sinEsePrecio.length === 1 ? "maneja" : "manejan"} {dinero(valor)} en
            Precios. Al guardar se agrega ahí también, para que la venta lo descuente del inventario como siempre.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || faltan.length > 0}
          aria-describedby="faltan-precio"
          className={`rounded-full bg-brand-gold px-6 py-2 text-sm font-semibold text-brand-black disabled:opacity-40 ${foco}`}
        >
          {pending ? "Guardando…" : "Guardar precio"}
        </button>
        <p id="faltan-precio" className="text-xs text-brand-cream/70">
          {faltan.length ? `Falta: ${faltan.join(", ")}.` : "Todo listo."}
        </p>
      </div>
      <div aria-live="polite">
        {mostrar && state?.error && <p className="text-sm text-brand-red">{state.error}</p>}
        {mostrar && state?.success && <p className="text-sm text-brand-green">{state.success}</p>}
      </div>
    </form>
  );
}

/** Botón para quitar el precio del modelo en una sucursal (deja de venderse ahí; queda en el historial). */
export function QuitarPrecioForm({ modeloId, sucursalId, sucursal }: { modeloId: number; sucursalId: number; sucursal: string }) {
  const [state, formAction, pending] = useActionState<PrecioModeloResult | undefined, FormData>(async (prev, formData) => {
    try {
      return await quitarPrecioModeloAction(prev, formData);
    } catch {
      return { error: "No se pudo quitar. Inténtalo de nuevo." };
    }
  }, undefined);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`¿Quitar el precio en ${sucursal}? Quedará en el historial.`)) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="modelo_id" value={modeloId} />
      <input type="hidden" name="sucursal_id" value={sucursalId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Quitar precio en ${sucursal}`}
        className={`text-sm text-brand-cream/70 underline hover:text-brand-red disabled:opacity-40 ${foco}`}
      >
        {pending ? "Quitando…" : "Quitar"}
      </button>
      {state?.error && <span className="ml-2 text-xs text-brand-red">{state.error}</span>}
    </form>
  );
}
