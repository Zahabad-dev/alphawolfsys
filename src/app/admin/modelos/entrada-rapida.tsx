"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { registrarEtiquetadoAction, type ConteoResult } from "./[id]/etiqueta/conteo-actions";

const foco = "focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:outline-none";
const campo = `rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream outline-none focus:border-brand-gold ${foco}`;

/**
 * "+ Entrada" en el catálogo de Modelos: registrar cuántas piezas de este modelo entraron (conteo interno).
 * Es el mismo registro que la pantalla de la etiqueta; no toca el inventario por precio.
 */
export default function EntradaRapida({
  modeloId,
  nombre,
  sucursales,
  sucursalInicial,
}: {
  modeloId: number;
  nombre: string;
  sucursales: { id: number; nombre: string }[];
  sucursalInicial: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [piezas, setPiezas] = useState("");
  const [sucursal, setSucursal] = useState(String(sucursalInicial));
  const [cambiado, setCambiado] = useState(false);
  // Llave del intento: se conserva si hay que reintentar (no cuenta doble) y se renueva tras registrar.
  const intento = useRef<string | null>(null);

  const [state, formAction, pending] = useActionState<ConteoResult | undefined, FormData>(async (prev, formData) => {
    let r: ConteoResult;
    try {
      intento.current ??= crypto.randomUUID();
      formData.set("intento", intento.current);
      r = await registrarEtiquetadoAction(prev, formData);
    } catch {
      r = { error: "No se pudo registrar. Revisa tu conexión e inténtalo de nuevo." };
    }
    startTransition(() => {
      setCambiado(false);
      if (r.registrado) {
        setPiezas("");
        intento.current = null;
      }
    });
    return r;
  }, undefined);

  const valido = /^[1-9]\d{0,4}$/.test(piezas.trim());
  const mensaje = !cambiado && !pending ? state : undefined;

  if (!abierto) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label={`Registrar entrada de ${nombre}`}
          className={`w-fit rounded-full border border-white/20 px-3 py-1 text-xs text-brand-cream/80 hover:border-brand-gold hover:text-brand-gold ${foco}`}
        >
          + Entrada
        </button>
        {mensaje?.success && <span className="text-xs text-brand-green">{mensaje.success}</span>}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-brand-black/40 p-2">
      <input type="hidden" name="modelo_id" value={modeloId} />
      <input type="hidden" name="sucursal_id" value={sucursal} />
      <input type="hidden" name="piezas" value={piezas} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-brand-cream/70">
          Piezas
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            value={piezas}
            onChange={(e) => {
              setPiezas(e.target.value);
              setCambiado(true);
            }}
            className={`${campo} w-20`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-brand-cream/70">
          Sucursal
          <select
            value={sucursal}
            onChange={(e) => {
              setSucursal(e.target.value);
              setCambiado(true);
            }}
            className={campo}
          >
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending || !valido}
          className={`rounded-full bg-brand-gold px-3 py-1 text-xs font-semibold text-brand-black disabled:opacity-40 ${foco}`}
        >
          {pending ? "Registrando…" : "Registrar entrada"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className={`text-xs text-brand-cream/70 underline hover:text-brand-gold ${foco}`}
        >
          Cerrar
        </button>
      </div>
      <div aria-live="polite" className="text-xs">
        {mensaje?.error && <span className="text-brand-red">{mensaje.error}</span>}
        {mensaje?.success && <span className="text-brand-green">{mensaje.success}</span>}
      </div>
    </form>
  );
}
