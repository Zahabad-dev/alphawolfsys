"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  CODIGO_MODELO_MAX,
  NOMBRE_BASE_MAX,
  PARTE_MAX,
  TEXTO_ETIQUETA_MAX,
  TEXTO_ETIQUETA_RECOMENDADO,
  claveModelo,
  componerNombre,
  limpiarNombreModelo,
  modelosParecidos,
  nombreSuficiente,
  textoEtiquetaAuto,
} from "@/lib/modelos";
import { crearModeloAction, editarModeloAction, type ModeloResult } from "./actions";

const foco = "focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:outline-none";
const campo = `rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-sm text-brand-cream outline-none focus:border-brand-gold ${foco}`;

export interface ModeloEditable {
  id: number;
  nombre: string;
  base: string;
  variante: string;
  distintivo: string;
  color: string;
  /** Vacío = se usa el texto automático. */
  textoEtiqueta: string;
  codigo: string | null;
  tallas: number[];
}

/** Lo que ya se usa en el catálogo, para sugerirlo al escribir (y no terminar con "PANA", "Pana" y "PANNA"). */
export interface Sugerencias {
  bases: string[];
  variantes: string[];
  distintivos: string[];
  colores: string[];
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
  sugerencias,
  modelo,
  volver,
}: {
  /** Todas las tallas en su orden; las desactivadas solo aparecen si el modelo ya las tiene. */
  tallas: TallaOpcion[];
  /** Todos los modelos (id y nombre), para avisar en vivo si el nombre se parece a uno existente. */
  catalogo: { id: number; nombre: string }[];
  sugerencias: Sugerencias;
  /** Si viene, el formulario edita ese modelo; si no, da de alta uno nuevo. */
  modelo?: ModeloEditable;
  /** A dónde regresa "Cancelar" (la lista con sus filtros). */
  volver: string;
}) {
  const editando = !!modelo;
  const [base, setBase] = useState(modelo?.base ?? "");
  const [variante, setVariante] = useState(modelo?.variante ?? "");
  const [distintivo, setDistintivo] = useState(modelo?.distintivo ?? "");
  const [color, setColor] = useState(modelo?.color ?? "");
  const [texto, setTexto] = useState(modelo?.textoEtiqueta ?? "");
  const nombre = componerNombre({ base, variante, distintivo, color });
  const textoAuto = textoEtiquetaAuto({ base, variante, distintivo, color });
  const textoFinal = limpiarNombreModelo(texto) || textoAuto;
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
            // Se conserva el modelo base para dar de alta su siguiente variante más rápido.
            setVariante("");
            setDistintivo("");
            setColor("");
            setTexto("");
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
  if (!nombreSuficiente(base)) faltan.push("el nombre del modelo");
  if (textoFinal.length > TEXTO_ETIQUETA_MAX) faltan.push(`acortar el texto de la etiqueta (máximo ${TEXTO_ETIQUETA_MAX})`);
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

      <datalist id="sug-bases">{sugerencias.bases.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="sug-variantes">{sugerencias.variantes.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="sug-distintivos">{sugerencias.distintivos.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="sug-colores">{sugerencias.colores.map((x) => <option key={x} value={x} />)}</datalist>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-64 flex-[3] flex-col gap-1 text-xs text-brand-cream/70">
          Modelo
          <input
            name="base"
            type="text"
            required
            list="sug-bases"
            maxLength={NOMBRE_BASE_MAX}
            value={base}
            onChange={(e) => cambia(() => { setBase(e.target.value); setConfirmado(false); })}
            placeholder="Ej. MAJA REPELENTE"
            className={`${campo} uppercase placeholder:normal-case`}
          />
        </label>
        <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs text-brand-cream/70">
          Variante (opcional)
          <input
            name="variante"
            type="text"
            list="sug-variantes"
            maxLength={PARTE_MAX}
            value={variante}
            onChange={(e) => cambia(() => { setVariante(e.target.value); setConfirmado(false); })}
            placeholder="Ej. MC, ML, ML 2XL-3XL"
            className={`${campo} uppercase placeholder:normal-case`}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs text-brand-cream/70">
          Distintivo (opcional)
          <input
            name="distintivo"
            type="text"
            list="sug-distintivos"
            maxLength={PARTE_MAX}
            value={distintivo}
            onChange={(e) => cambia(() => { setDistintivo(e.target.value); setConfirmado(false); })}
            placeholder="Material o referente, ej. PANA"
            className={`${campo} uppercase placeholder:normal-case`}
          />
        </label>
        <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs text-brand-cream/70">
          Color (opcional)
          <input
            name="color"
            type="text"
            list="sug-colores"
            maxLength={PARTE_MAX}
            value={color}
            onChange={(e) => cambia(() => { setColor(e.target.value); setConfirmado(false); })}
            placeholder="Ej. ROJO"
            className={`${campo} uppercase placeholder:normal-case`}
          />
        </label>
        <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs text-brand-cream/70">
          Código (opcional)
          <input
            name="codigo"
            type="text"
            maxLength={CODIGO_MODELO_MAX}
            value={codigo}
            onChange={(e) => cambia(() => setCodigo(e.target.value))}
            placeholder="Ej. MR-MC"
            className={`${campo} uppercase placeholder:normal-case`}
          />
        </label>
      </div>

      <p className="text-sm text-brand-cream/80">
        Nombre completo: <span className="font-semibold text-brand-cream">{nombreSuficiente(base) ? nombre : "—"}</span>
      </p>

      <div className="flex flex-wrap items-start gap-4">
        <label className="flex min-w-64 flex-[3] flex-col gap-1 text-xs text-brand-cream/70">
          Texto de la etiqueta (déjalo vacío para usar el nombre; acórtalo si es muy largo)
          <input
            name="texto_etiqueta"
            type="text"
            maxLength={TEXTO_ETIQUETA_MAX + 20}
            value={texto}
            onChange={(e) => cambia(() => setTexto(e.target.value))}
            placeholder={textoAuto || "Ej. CAM. CUADRO FRANELA ML PANA ROJO"}
            aria-describedby="contador-etiqueta"
            className={`${campo} uppercase placeholder:normal-case`}
          />
          <span
            id="contador-etiqueta"
            className={
              textoFinal.length > TEXTO_ETIQUETA_MAX
                ? "text-brand-red"
                : textoFinal.length > TEXTO_ETIQUETA_RECOMENDADO
                  ? "text-yellow-500"
                  : "text-brand-cream/70"
            }
          >
            {textoFinal.length} letras
            {textoFinal.length > TEXTO_ETIQUETA_MAX
              ? ` — máximo ${TEXTO_ETIQUETA_MAX}, acórtalo.`
              : textoFinal.length > TEXTO_ETIQUETA_RECOMENDADO
                ? ` — saldrá con letra chica; mejor acórtalo a ${TEXTO_ETIQUETA_RECOMENDADO} o menos.`
                : " — cabe bien en la etiqueta."}
          </span>
        </label>
        <div aria-hidden className="w-28 rounded-lg bg-white p-2 text-center text-black">
          <div className="mx-auto mb-1 grid h-16 w-16 place-items-center rounded border-2 border-purple-700 text-[10px] text-black/50">
            QR
          </div>
          <p className={`font-bold leading-tight ${textoFinal.length > TEXTO_ETIQUETA_RECOMENDADO ? "text-[8px]" : "text-[10px]"}`}>
            {nombreSuficiente(base) ? textoFinal : "MODELO"}
          </p>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs text-brand-cream/70">Tallas que maneja (opcional; solo control interno, no se usan en la venta)</legend>
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
