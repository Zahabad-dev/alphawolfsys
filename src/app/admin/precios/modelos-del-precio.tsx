"use client";

import { createContext, startTransition, useActionState, useContext, useState, type ReactNode } from "react";
import { dinero } from "@/lib/formato";
import { limpiarNombreModelo } from "@/lib/modelos";
import {
  ponerPrecioModeloAction,
  quitarPrecioModeloAction,
  type PrecioModeloResult,
} from "@/app/admin/modelos/[id]/precios/actions";

const foco = "focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:outline-none";

export interface ModeloDelPrecio {
  id: number;
  nombre: string;
}

export interface ModeloCatalogo {
  id: number;
  nombre: string;
  /** Precio vigente de este modelo en ESTA sucursal (para avisar que se moverá), o null. */
  precioEnSucursal: number | null;
}

/** El catálogo de modelos se manda UNA vez por sucursal (no una vez por cada precio). */
const CatalogoContext = createContext<{ listaId: string; catalogo: ModeloCatalogo[] }>({ listaId: "", catalogo: [] });

export function CatalogoSucursal({
  sucursalId,
  catalogo,
  children,
}: {
  sucursalId: number;
  catalogo: ModeloCatalogo[];
  children: ReactNode;
}) {
  const listaId = `modelos-suc-${sucursalId}`;
  return (
    <CatalogoContext.Provider value={{ listaId, catalogo }}>
      <datalist id={listaId}>
        {catalogo.map((m) => (
          <option key={m.id} value={m.nombre} />
        ))}
      </datalist>
      {children}
    </CatalogoContext.Provider>
  );
}

/**
 * Debajo de cada precio de una sucursal: qué modelos lo tienen, y agregar/quitar. Es la misma información que
 * "Modelos → Poner precios", vista desde el precio. Un modelo tiene un solo precio por sucursal: si se agrega
 * aquí uno que tenía otro precio, se mueve (y queda en el historial).
 */
export default function ModelosDelPrecio({
  sucursalId,
  sucursal,
  precio,
  modelos,
  gestiona,
  activo,
}: {
  sucursalId: number;
  sucursal: string;
  precio: number;
  modelos: ModeloDelPrecio[];
  gestiona: boolean;
  /** Si el precio está desactivado no se le agregan modelos. */
  activo: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [cambiadoTrasEnvio, setCambiadoTrasEnvio] = useState(false);
  const { listaId, catalogo } = useContext(CatalogoContext);
  const [errorQuitar, setErrorQuitar] = useState<string | null>(null);
  const elegido = catalogo.find((m) => m.nombre === limpiarNombreModelo(texto));
  const yaEsta = !!elegido && modelos.some((m) => m.id === elegido.id);
  const seMueve = elegido && !yaEsta && elegido.precioEnSucursal !== null ? elegido.precioEnSucursal : null;

  const [state, formAction, pending] = useActionState<PrecioModeloResult | undefined, FormData>(async (prev, formData) => {
    try {
      const r = await ponerPrecioModeloAction(prev, formData);
      startTransition(() => {
        setCambiadoTrasEnvio(false);
        if (r.success) setTexto("");
      });
      return r;
    } catch {
      return { error: "No se pudo guardar. Inténtalo de nuevo." };
    }
  }, undefined);
  const mostrar = !cambiadoTrasEnvio && !pending;

  if (!gestiona && !modelos.length) return null;

  return (
    <div className="flex flex-col gap-2 px-4 pb-3 pt-1 text-sm">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-brand-cream/70">Modelos con este precio:</span>
        {modelos.length === 0 && <span className="text-xs text-brand-cream/50">ninguno todavía</span>}
        <span role="alert" className="text-xs text-brand-red">
          {errorQuitar}
        </span>
        {modelos.map((m) => (
          <span key={m.id} className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-brand-cream/90">
            {m.nombre}
            {gestiona && (
              <QuitarModelo modeloId={m.id} nombre={m.nombre} sucursalId={sucursalId} sucursal={sucursal} onError={setErrorQuitar} />
            )}
          </span>
        ))}
      </div>

      {gestiona && activo && (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="modelo_id" value={elegido?.id ?? ""} />
          <input type="hidden" name="precio" value={precio} />
          <input type="hidden" name="sucursal" value={sucursalId} />
          <input
            type="text"
            list={listaId}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setCambiadoTrasEnvio(true);
            }}
            placeholder="+ agregar modelo (escribe para buscar)"
            aria-label={`Agregar modelo a ${dinero(precio)} en ${sucursal}`}
            className={`w-72 rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-xs text-brand-cream outline-none focus:border-brand-gold ${foco}`}
          />
          <button
            type="submit"
            disabled={pending || !elegido || yaEsta}
            className={`rounded-full bg-brand-gold px-3 py-1 text-xs font-semibold text-brand-black disabled:opacity-40 ${foco}`}
          >
            {pending ? "Agregando…" : "Agregar"}
          </button>
          <span aria-live="polite" className="flex basis-full flex-col text-xs">
            {texto && !elegido && <span className="text-brand-cream/70">Elige un modelo de la lista.</span>}
            {yaEsta && <span className="text-brand-cream/70">Ese modelo ya tiene este precio.</span>}
            {seMueve !== null && (
              <span className="text-yellow-500">
                En {sucursal} cuesta {dinero(seMueve)}: pasará a {dinero(precio)} (queda en el historial).
              </span>
            )}
            {mostrar && state?.error && <span className="text-brand-red">{state.error}</span>}
            {mostrar && state?.success && <span className="text-brand-green">Modelo agregado a {dinero(precio)}.</span>}
          </span>
        </form>
      )}
    </div>
  );
}

function QuitarModelo({
  modeloId,
  nombre,
  sucursalId,
  sucursal,
  onError,
}: {
  modeloId: number;
  nombre: string;
  sucursalId: number;
  sucursal: string;
  onError: (msg: string | null) => void;
}) {
  const [, formAction, pending] = useActionState<PrecioModeloResult | undefined, FormData>(async (prev, formData) => {
    let r: PrecioModeloResult;
    try {
      r = await quitarPrecioModeloAction(prev, formData);
    } catch {
      r = { error: "No se pudo quitar. Inténtalo de nuevo." };
    }
    onError(r.error ? `${nombre}: ${r.error}` : null);
    return r;
  }, undefined);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`¿Quitar el precio de ${nombre} en ${sucursal}? Quedará en el historial.`)) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="modelo_id" value={modeloId} />
      <input type="hidden" name="sucursal_id" value={sucursalId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Quitar ${nombre} de este precio`}
        className={`grid min-h-6 min-w-6 place-items-center rounded-full text-brand-cream/60 hover:text-brand-red disabled:opacity-40 ${foco}`}
      >
        ×
      </button>
    </form>
  );
}
