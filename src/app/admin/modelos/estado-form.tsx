"use client";

import { startTransition, useActionState, useState } from "react";
import {
  cambiarEstadoModeloAction,
  cambiarEstadoTallaAction,
  crearTallaAction,
  moverTallaAction,
  type ModeloResult,
} from "./actions";

const foco = "focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:outline-none";

/** Envuelve una acción para que un fallo de red se vea como mensaje y no como pantalla de error. */
function useAccion(accion: (prev: ModeloResult | undefined, fd: FormData) => Promise<ModeloResult>, siFalla: string) {
  return useActionState<ModeloResult | undefined, FormData>(async (prev, fd) => {
    try {
      return await accion(prev, fd);
    } catch {
      return { error: siFalla };
    }
  }, undefined);
}

/** Descontinuar o reactivar un modelo, con aviso si algo falla y sin doble clic. */
export function EstadoModeloForm({ id, nombre, activo }: { id: number; nombre: string; activo: boolean }) {
  const [state, formAction, pending] = useAccion(cambiarEstadoModeloAction, "No se pudo cambiar. Inténtalo de nuevo.");
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activar" value={activo ? "" : "1"} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`${activo ? "Descontinuar" : "Reactivar"} ${nombre}`}
        className={`text-sm text-brand-cream/70 underline disabled:opacity-50 ${activo ? "hover:text-brand-red" : "hover:text-brand-green"} ${foco}`}
      >
        {pending ? "Guardando…" : activo ? "Descontinuar" : "Reactivar"}
      </button>
      {state?.error && <span className="ml-2 text-xs text-brand-red">{state.error}</span>}
    </form>
  );
}

/** Agregar una talla nueva: al final o después de la que se elija (ej. XS antes de CH, 4XL después de 3XL). */
export function NuevaTallaForm({ tallas }: { tallas: { id: number; nombre: string }[] }) {
  const [talla, setTalla] = useState("");
  const [despuesDe, setDespuesDe] = useState("");
  const [state, formAction, pending] = useActionState<ModeloResult | undefined, FormData>(async (prev, fd) => {
    try {
      const r = await crearTallaAction(prev, fd);
      if (r.success) startTransition(() => setTalla(""));
      return r;
    } catch {
      return { error: "No se pudo agregar. Inténtalo de nuevo." };
    }
  }, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-brand-cream/70">
        Talla nueva
        <input
          name="talla"
          type="text"
          required
          maxLength={10}
          value={talla}
          onChange={(e) => setTalla(e.target.value)}
          placeholder="Ej. 4XL"
          className={`w-28 rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-sm uppercase text-brand-cream outline-none placeholder:normal-case focus:border-brand-gold ${foco}`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-brand-cream/70">
        Va
        <select
          name="despues_de"
          value={despuesDe}
          onChange={(e) => setDespuesDe(e.target.value)}
          className={`rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-sm text-brand-cream outline-none focus:border-brand-gold ${foco}`}
        >
          <option value="">al final</option>
          {tallas.map((t) => (
            <option key={t.id} value={t.id}>
              después de {t.nombre}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className={`rounded-full border border-white/10 px-4 py-2 text-sm text-brand-cream/80 hover:border-brand-gold hover:text-brand-gold disabled:opacity-50 ${foco}`}
      >
        {pending ? "Agregando…" : "Agregar talla"}
      </button>
      <div aria-live="polite" className="w-full">
        {state?.error && <p className="text-xs text-brand-red">{state.error}</p>}
        {state?.success && <p className="text-xs text-brand-green">{state.success}</p>}
      </div>
    </form>
  );
}

/** Una talla de la lista: subir, bajar y desactivar/activar. */
export function TallaFila({
  id,
  nombre,
  activa,
  primera,
  ultima,
}: {
  id: number;
  nombre: string;
  activa: boolean;
  primera: boolean;
  ultima: boolean;
}) {
  const [estadoMov, mover, moviendo] = useAccion(moverTallaAction, "No se pudo mover. Inténtalo de nuevo.");
  const [estadoAct, cambiar, cambiando] = useAccion(cambiarEstadoTallaAction, "No se pudo cambiar. Inténtalo de nuevo.");
  const boton = `rounded-full border border-white/10 px-2 py-1 text-xs text-brand-cream/80 hover:border-brand-gold hover:text-brand-gold disabled:opacity-30 ${foco}`;
  const error = estadoMov?.error ?? estadoAct?.error;
  return (
    <li className="flex flex-wrap items-center gap-2 border-t border-white/10 py-2 first:border-t-0">
      <span className={`min-w-14 font-semibold ${activa ? "text-brand-cream" : "text-brand-cream/70 line-through"}`}>{nombre}</span>
      {!activa && <span className="text-xs text-brand-cream/70">desactivada</span>}
      <form action={mover} className="inline-flex gap-1">
        <input type="hidden" name="id" value={id} />
        <button type="submit" name="dir" value="sube" disabled={primera || moviendo} aria-label={`Subir ${nombre}`} className={boton}>
          ↑
        </button>
        <button type="submit" name="dir" value="baja" disabled={ultima || moviendo} aria-label={`Bajar ${nombre}`} className={boton}>
          ↓
        </button>
      </form>
      <form action={cambiar} className="inline">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="activar" value={activa ? "" : "1"} />
        <button type="submit" disabled={cambiando} aria-label={`${activa ? "Desactivar" : "Activar"} la talla ${nombre}`} className={boton}>
          {activa ? "Desactivar" : "Activar"}
        </button>
      </form>
      {error && <span className="text-xs text-brand-red">{error}</span>}
    </li>
  );
}
