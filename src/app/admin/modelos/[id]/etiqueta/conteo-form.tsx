"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { registrarEtiquetadoAction, type ConteoResult } from "./conteo-actions";

const campo = "rounded-lg border border-black/20 px-3 py-2 text-black outline-none focus:border-black";

/**
 * Después de etiquetar: cuántas piezas de este modelo se etiquetaron (conteo interno). Viene lleno con el número
 * de copias; se corrige si se imprimieron de más. "Corrección" permite restar (o sumar) con un motivo.
 */
export default function ConteoForm({
  modeloId,
  sucursales,
  sucursalInicial,
  copias,
}: {
  modeloId: number;
  sucursales: { id: number; nombre: string }[];
  sucursalInicial: number;
  copias: number;
}) {
  const [piezas, setPiezas] = useState(String(copias));
  const [sucursal, setSucursal] = useState(String(sucursalInicial));
  const [correccion, setCorreccion] = useState(false);
  const [nota, setNota] = useState("");
  // Llave del intento: se crea al enviar y se conserva si hay que reintentar (no cuenta doble);
  // se renueva después de un registro exitoso. En un ref para que no difiera entre servidor y navegador.
  const intento = useRef<string | null>(null);
  const [cambiado, setCambiado] = useState(false);

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
        setCorreccion(false);
        setNota("");
        // Se vacía para que no se vuelva a registrar lo mismo por accidente.
        setPiezas("");
        intento.current = null;
      }
    });
    return r;
  }, undefined);

  const cambia = (fn: () => void) => {
    fn();
    setCambiado(true);
  };
  const valido = correccion ? /^-?[1-9]\d{0,4}$/.test(piezas.trim()) && nota.trim() !== "" : /^[1-9]\d{0,4}$/.test(piezas.trim());

  return (
    <form action={formAction} className="flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-black/10 p-4 print:hidden">
      <input type="hidden" name="modelo_id" value={modeloId} />
      <input type="hidden" name="sucursal_id" value={sucursal} />
      <input type="hidden" name="correccion" value={correccion ? "1" : ""} />
      <input type="hidden" name="piezas" value={piezas} />
      <input type="hidden" name="nota" value={nota} />
      <p className="text-sm font-semibold">
        {correccion ? "Corregir el conteo de este modelo" : "¿Cuántas piezas de este modelo etiquetaste?"}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-black/70">
          {correccion ? "Piezas (+ suma, − resta)" : "Piezas"}
          <input
            type="text"
            inputMode={correccion ? "text" : "numeric"}
            value={piezas}
            onChange={(e) => cambia(() => setPiezas(e.target.value))}
            className={`${campo} w-28`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-black/70">
          Dónde se etiquetaron
          <select value={sucursal} onChange={(e) => cambia(() => setSucursal(e.target.value))} className={campo}>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        {correccion && (
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm text-black/70">
            Motivo
            <input
              type="text"
              maxLength={200}
              value={nota}
              onChange={(e) => cambia(() => setNota(e.target.value))}
              placeholder="Ej. se imprimieron 2 de más"
              className={campo}
            />
          </label>
        )}
        <button
          type="submit"
          disabled={pending || !valido}
          className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Registrando…" : correccion ? "Registrar corrección" : "Registrar piezas etiquetadas"}
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm text-black/70">
        <input
          type="checkbox"
          checked={correccion}
          onChange={(e) =>
            cambia(() => {
              setCorreccion(e.target.checked);
              setPiezas("");
            })
          }
        />
        Es una corrección (por ejemplo, se imprimieron de más)
      </label>
      <div aria-live="polite">
        {!cambiado && !pending && state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        {!cambiado && !pending && state?.success && <p className="text-sm text-green-700">{state.success}</p>}
      </div>
    </form>
  );
}
