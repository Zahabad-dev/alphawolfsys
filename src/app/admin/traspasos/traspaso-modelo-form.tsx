"use client";

import { startTransition, useActionState, useState } from "react";
import { dinero } from "@/lib/formato";
import { limpiarNombreModelo } from "@/lib/modelos";
import { registrarTraspasoModeloAction, type TraspasoModeloResult } from "./traspaso-modelo-actions";

const campo =
  "rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold";

export interface DatosTraspasoModelo {
  modelos: { id: number; nombre: string }[];
  sucursales: { id: number; nombre: string; esAlmacen: boolean }[];
  /** precios[modeloId][sucursalId] = precio vigente del modelo ahí. */
  precios: Record<number, Record<number, number>>;
  /** stock["sucursalId|precio"] = piezas de ese precio en esa sucursal. */
  stock: Record<string, number>;
}

/** Traspaso por modelo: las piezas llegan al precio que el modelo tiene en la sucursal destino. */
export default function TraspasoModeloForm({ modelos, sucursales, precios, stock }: DatosTraspasoModelo) {
  const almacen = sucursales.find((s) => s.esAlmacen);
  const [texto, setTexto] = useState("");
  const [origen, setOrigen] = useState(String(almacen?.id ?? ""));
  const [destino, setDestino] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [cambiado, setCambiado] = useState(false);

  const [state, formAction, pending] = useActionState<TraspasoModeloResult | undefined, FormData>(async (prev, fd) => {
    let r: TraspasoModeloResult;
    try {
      r = await registrarTraspasoModeloAction(prev, fd);
    } catch {
      r = { error: "No se pudo registrar. Revisa tu conexión e inténtalo de nuevo." };
    }
    startTransition(() => {
      setCambiado(false);
      if (r.hecho) {
        setCantidad("");
        setNota("");
      }
    });
    return r;
  }, undefined);

  const cambia = (f: () => void) => {
    f();
    setCambiado(true);
  };
  const modelo = modelos.find((m) => m.nombre === limpiarNombreModelo(texto));
  const precioEn = (sucId: number) =>
    modelo ? (precios[modelo.id]?.[sucId] ?? (almacen ? precios[modelo.id]?.[almacen.id] : undefined)) : undefined;
  const o = Number(origen);
  const d = Number(destino);
  const pO = o ? precioEn(o) : undefined;
  const pD = d ? precioEn(d) : undefined;
  const hay = pO !== undefined ? (stock[`${o}|${pO.toFixed(2)}`] ?? 0) : undefined;
  const nombre = (id: number) => sucursales.find((s) => s.id === id)?.nombre ?? "";
  const sinPrecio = (id: number) =>
    sucursales.find((s) => s.id === id)?.esAlmacen
      ? "Este modelo no tiene precio en el Almacén. Ponle precio primero."
      : `Este modelo no tiene precio en ${nombre(id)} ni en el Almacén. Ponle precio primero.`;
  const listo = !!modelo && !!o && !!d && o !== d && /^[1-9]\d{0,5}$/.test(cantidad.trim()) && pO !== undefined && pD !== undefined;

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4">
      <input type="hidden" name="modelo_id" value={modelo?.id ?? ""} />
      <input type="hidden" name="origen_id" value={origen} />
      <input type="hidden" name="destino_id" value={destino} />
      <input type="hidden" name="cantidad" value={cantidad} />
      <input type="hidden" name="nota" value={nota} />
      <div>
        <h2 className="text-base font-semibold text-brand-cream">Traspaso por modelo</h2>
        <p className="text-xs text-brand-cream/70">
          Las piezas salen del precio del modelo en el origen y llegan al precio que ese modelo tiene en la sucursal
          destino, para que la etiqueta del modelo cobre y descuente bien ahí.
        </p>
      </div>
      <datalist id="modelos-traspaso">
        {modelos.map((m) => (
          <option key={m.id} value={m.nombre} />
        ))}
      </datalist>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-64 flex-[2] flex-col gap-1 text-sm text-brand-cream/80">
          Modelo
          <input
            list="modelos-traspaso"
            value={texto}
            onChange={(e) => cambia(() => setTexto(e.target.value))}
            placeholder="Escribe para buscar"
            className={campo}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm text-brand-cream/80">
          Origen
          <select value={origen} onChange={(e) => cambia(() => setOrigen(e.target.value))} className={campo}>
            <option value="">Selecciona...</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm text-brand-cream/80">
          Destino
          <select value={destino} onChange={(e) => cambia(() => setDestino(e.target.value))} className={campo}>
            <option value="">Selecciona...</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
          Piezas
          <input
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => cambia(() => setCantidad(e.target.value))}
            className={`${campo} w-28`}
          />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm text-brand-cream/80">
          Nota (opcional)
          <input value={nota} maxLength={200} onChange={(e) => cambia(() => setNota(e.target.value))} className={campo} />
        </label>
        <button
          type="submit"
          disabled={pending || !listo}
          className="rounded-full bg-brand-gold px-6 py-2 font-semibold text-brand-black disabled:opacity-40"
        >
          {pending ? "Traspasando..." : "Registrar traspaso"}
        </button>
      </div>
      <div aria-live="polite" className="text-sm">
        {texto && !modelo && <p className="text-brand-cream/70">Elige un modelo de la lista.</p>}
        {modelo && o > 0 && d > 0 && o === d && <p className="text-brand-red">El origen y el destino no pueden ser la misma sucursal.</p>}
        {modelo && o > 0 && pO === undefined && <p className="text-brand-red">{sinPrecio(o)}</p>}
        {modelo && d > 0 && pD === undefined && o !== d && <p className="text-brand-red">{sinPrecio(d)}</p>}
        {modelo && pO !== undefined && pD !== undefined && o !== d && d > 0 && (
          <p className="text-brand-cream/90">
            Salen de <strong>{dinero(pO)}</strong> de {nombre(o)} (hay {hay ?? 0}) → llegan a <strong>{dinero(pD)}</strong> de{" "}
            {nombre(d)}
            {pO !== pD && <span className="text-yellow-500"> · cambia de precio al llegar</span>}
          </p>
        )}
        {!cambiado && !pending && state?.error && <p className="text-brand-red">{state.error}</p>}
        {!cambiado && !pending && state?.success && <p className="text-brand-green">{state.success}</p>}
      </div>
    </form>
  );
}
