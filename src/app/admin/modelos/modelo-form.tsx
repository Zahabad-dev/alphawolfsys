"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { CODIGO_MODELO_MAX, NOMBRE_MODELO_MAX, claveModelo, limpiarNombreModelo, modelosParecidos, nombreSuficiente } from "@/lib/modelos";
import { crearModeloAction, editarModeloAction, type ModeloResult } from "./actions";

const foco = "focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:outline-none";
const campo = `rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-sm text-brand-cream outline-none focus:border-brand-gold ${foco}`;

export interface ModeloEditable {
  id: number;
  nombre: string;
  codigo: string | null;
  tallas: number[];
}

export interface TallaOpcion {
  id: number;
  nombre: string;
  activa: boolean;
}

/**
 * Alta o edición de un modelo. Los campos son controlados (y las tallas viajan en campos ocultos) para que
 * nada de lo escrito se pierda si el servidor responde con un error o con un aviso de modelos parecidos.
 */
export default function ModeloForm({
  tallas,
  catalogo,
  modelo,
  volver,
}: {
  /** Todas las tallas en su orden; las desactivadas solo aparecen si el modelo ya las tiene. */
  tallas: TallaOpcion[];
  /** Todos los modelos (id y nombre), para avisar en vivo si el nombre se parece a uno existente. */
  catalogo: { id: number; nombre: string }[];
  /** Si viene, el formulario edita ese modelo; si no, da de alta uno nuevo. */
  modelo?: ModeloEditable;
  /** A dónde regresa "Cancelar" (la lista con sus filtros). */
  volver: string;
}) {
  const editando = !!modelo;
  const [nombre, setNombre] = useState(modelo?.nombre ?? "");
  const [codigo, setCodigo] = useState(modelo?.codigo ?? "");
  const [elegidas, setElegidas] = useState<number[]>(modelo?.tallas ?? []);
  const [confirmado, setConfirmado] = useState(false);
  // Los mensajes de la última respuesta se esconden en cuanto se vuelve a escribir (ya no aplican).
  const [cambiadoTrasEnvio, setCambiadoTrasEnvio] = useState(false);

  // Al editar sin cambiar el nombre no se pregunta por parecidos: ya se decidió al darlo de alta.
  const mismoNombreQueAntes = !!modelo && claveModelo(nombre) === claveModelo(modelo.nombre);
  const parecidosPantalla = useMemo(
    () => (mismoNombreQueAntes ? [] : modelosParecidos(nombre, catalogo, modelo?.id).map((m) => m.nombre)),
    [nombre, catalogo, modelo?.id, mismoNombreQueAntes]
  );

  const [state, formAction, pending] = useActionState<ModeloResult | undefined, FormData>(
    async (prev, formData) => {
      try {
        const r = await (editando ? editarModeloAction : crearModeloAction)(prev, formData);
        startTransition(() => {
          setCambiadoTrasEnvio(false);
          if (r.success && !editando) {
            setNombre("");
            setCodigo("");
            setElegidas([]);
            setConfirmado(false);
          }
        });
        return r;
      } catch {
        return { error: "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo." };
      }
    },
    undefined
  );

  const cambia = (fn: () => void) => {
    fn();
    setCambiadoTrasEnvio(true);
  };

  // Los parecidos que avisó el servidor solo cuentan mientras el nombre siga siendo el que se envió.
  const parecidosServidor =
    state?.parecidos && state.nombreEnviado === limpiarNombreModelo(nombre) ? state.parecidos : [];
  const avisos = [...new Set([...parecidosPantalla, ...parecidosServidor])];
  const faltan: string[] = [];
  if (!nombreSuficiente(nombre)) faltan.push("el nombre del modelo");
  if (!elegidas.length) faltan.push("al menos una talla");
  if (avisos.length && !confirmado) faltan.push("confirmar que no es un modelo repetido");
  const visibles = tallas.filter((t) => t.activa || elegidas.includes(t.id));
  const enOrden = (ids: number[]) => tallas.filter((t) => ids.includes(t.id)).map((t) => t.id);
  const mostrarMensajes = !cambiadoTrasEnvio && !pending;

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-brand-gray2 p-4 sm:p-5">
      {editando && <input type="hidden" name="id" value={modelo.id} />}
      {elegidas.map((id) => (
        <input key={id} type="hidden" name="talla" value={id} />
      ))}
      <input type="hidden" name="confirmado" value={confirmado ? "1" : ""} />

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-64 flex-[3] flex-col gap-1 text-xs text-brand-cream/70">
          Nombre completo del modelo (con manga y color)
          <input
            name="nombre"
            type="text"
            required
            maxLength={NOMBRE_MODELO_MAX}
            value={nombre}
            onChange={(e) =>
              cambia(() => {
                setNombre(e.target.value);
                setConfirmado(false);
              })
            }
            placeholder="Ej. CAMISA CUADRO FRANELA ADULTO M/L (ROJO)"
            className={`${campo} uppercase placeholder:normal-case`}
          />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-brand-cream/70">
          Código (opcional)
          <input
            name="codigo"
            type="text"
            maxLength={CODIGO_MODELO_MAX}
            value={codigo}
            onChange={(e) => cambia(() => setCodigo(e.target.value))}
            placeholder="Ej. CF-ML-ROJO"
            className={`${campo} uppercase placeholder:normal-case`}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs text-brand-cream/70">Tallas que maneja</legend>
        <div className="flex flex-wrap gap-2">
          {visibles.map((t) => {
            const activa = elegidas.includes(t.id);
            return (
              <label
                key={t.id}
                title={t.activa ? undefined : "Talla desactivada: quítala si ya no aplica"}
                className={`min-w-14 cursor-pointer rounded-full border px-4 py-2 text-center text-sm focus-within:ring-2 focus-within:ring-brand-gold ${
                  activa
                    ? "border-brand-gold bg-brand-gold/15 font-semibold text-brand-gold"
                    : "border-white/10 text-brand-cream/80 hover:border-brand-gold/60"
                } ${t.activa ? "" : "line-through"}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={activa}
                  onChange={() =>
                    cambia(() => setElegidas((prev) => (prev.includes(t.id) ? prev.filter((x) => x !== t.id) : enOrden([...prev, t.id]))))
                  }
                />
                {t.nombre}
                {!t.activa && <span className="sr-only"> (desactivada)</span>}
              </label>
            );
          })}
          <button
            type="button"
            onClick={() => cambia(() => setElegidas(enOrden([...elegidas, ...tallas.filter((t) => t.activa).map((t) => t.id)])))}
            className={`rounded-full px-3 py-2 text-xs text-brand-cream/70 underline hover:text-brand-gold ${foco}`}
          >
            Todas
          </button>
        </div>
      </fieldset>

      {/* Siempre montado para que los lectores de pantalla anuncien el aviso cuando aparezca. */}
      <div role="status" aria-live="polite">
        {avisos.length > 0 && (
          <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-brand-cream">
            <p className="font-semibold text-yellow-500">¿No será un modelo que ya existe?</p>
            <p className="mt-1 text-xs text-brand-cream/80">Se parece a:</p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {avisos.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmado}
                onChange={(e) => cambia(() => setConfirmado(e.target.checked))}
                className="h-4 w-4 accent-brand-gold"
              />
              Sí, es un modelo distinto
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || faltan.length > 0}
          aria-describedby="faltan-modelo"
          className={`rounded-full bg-brand-gold px-6 py-2 text-sm font-semibold text-brand-black disabled:opacity-40 ${foco}`}
        >
          {pending ? "Guardando…" : editando ? "Guardar cambios" : "Dar de alta el modelo"}
        </button>
        {editando && (
          <Link href={volver} className="text-sm text-brand-cream/70 underline hover:text-brand-gold">
            Cancelar
          </Link>
        )}
        <p id="faltan-modelo" className="text-xs text-brand-cream/70">
          {faltan.length ? `Falta: ${faltan.join(", ")}.` : "Todo listo."}
        </p>
      </div>

      <div aria-live="polite">
        {mostrarMensajes && state?.error && <p className="text-sm text-brand-red">{state.error}</p>}
        {mostrarMensajes && state?.success && <p className="text-sm text-brand-green">{state.success}</p>}
      </div>
    </form>
  );
}
