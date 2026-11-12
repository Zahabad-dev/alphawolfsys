"use client";

import { useActionState, useState } from "react";
import {
  COMENTARIO_AJUSTE_MAX,
  COMENTARIO_AJUSTE_MIN,
  MOTIVOS_AJUSTE,
  PIEZAS_AJUSTE_MAX,
  largoTexto,
} from "@/lib/ajustes";
import {
  registrarAjusteDirectoAction,
  solicitarAjusteAction,
  type AjusteResult,
} from "./actions";

export interface LoteAjuste {
  id: number;
  sucursalId: number;
  lugar: string;
  precio: number;
  stock: number;
}

type Modo = "resta" | "suma" | "fijar";

const foco = "focus-visible:ring-2 focus-visible:ring-brand-gold focus-visible:outline-none";
const campo = `rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-sm text-brand-cream outline-none focus:border-brand-gold ${foco}`;
/** Las opciones son radios ocultos: el contorno de foco se dibuja en la etiqueta que los envuelve. */
const focoEtiqueta = "focus-within:ring-2 focus-within:ring-brand-gold";

const miles = (n: number) => n.toLocaleString("es-MX");

/**
 * Formulario de ajuste en pasos. La administración ajusta directo (con su contraseña); la gerente
 * envía una solicitud que la administración autoriza. En los dos casos el motivo y el comentario
 * son obligatorios: así queda documentado qué pasó.
 */
export default function AjusteForm({
  lotes,
  esAdmin,
  tokenInicial,
  loteInicial,
}: {
  lotes: LoteAjuste[];
  esAdmin: boolean;
  /** Identificador del primer envío; después de cada envío exitoso se genera otro nuevo. */
  tokenInicial: string;
  /** Si viene (botón "Ajustar" del Inventario), el formulario abre con ese lugar y precio elegidos. */
  loteInicial?: number;
}) {
  const inicial = lotes.find((l) => l.id === loteInicial);
  const [sucursalId, setSucursalId] = useState<number>(inicial?.sucursalId ?? 0);
  const [loteId, setLoteId] = useState<number>(inicial?.id ?? 0);
  const [modo, setModo] = useState<Modo>("resta");
  const [piezas, setPiezas] = useState("");
  const [correcta, setCorrecta] = useState("");
  const [motivo, setMotivo] = useState("");
  const [comentario, setComentario] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(tokenInicial);

  const lugares = [...new Map(lotes.map((l) => [l.sucursalId, l.lugar])).entries()];
  const delLugar = lotes.filter((l) => l.sucursalId === sucursalId);
  const lote = lotes.find((l) => l.id === loteId) ?? null;

  // Lo que se enviará: siempre "suma o resta N piezas", aunque la persona haya escrito la existencia correcta.
  let direccion: "suma" | "resta" = modo === "suma" ? "suma" : "resta";
  let n = Number(piezas);
  let objetivoInvalido = false;
  if (modo === "fijar") {
    const objetivo = Number(correcta);
    if (lote && correcta !== "" && Number.isInteger(objetivo) && objetivo >= 0) {
      direccion = objetivo >= lote.stock ? "suma" : "resta";
      n = Math.abs(objetivo - lote.stock);
    } else {
      n = 0;
      objetivoInvalido = correcta !== "";
    }
  }
  const piezasValidas = Number.isInteger(n) && n > 0 && n <= PIEZAS_AJUSTE_MAX;
  const quedara = lote && piezasValidas ? lote.stock + (direccion === "suma" ? n : -n) : null;
  const sobrepasa = !!lote && piezasValidas && direccion === "resta" && n > lote.stock;
  const comentarioOk = largoTexto(comentario.trim()) >= COMENTARIO_AJUSTE_MIN;

  // Lo que todavía falta, dicho con palabras, para que el botón apagado no sea un misterio.
  const faltan: string[] = [];
  if (!lote) faltan.push("elegir el lugar y el precio");
  else if (modo === "fijar" && correcta === "") faltan.push("escribir la existencia correcta");
  else if (modo !== "fijar" && !piezasValidas) faltan.push("escribir cuántas piezas");
  else if (modo === "fijar" && n === 0 && !objetivoInvalido) faltan.push("escribir una existencia distinta a la actual");
  if (sobrepasa) faltan.push("corregir las piezas (no hay tantas)");
  if (motivo === "") faltan.push("elegir qué fue lo que pasó");
  if (!comentarioOk) faltan.push(`explicar qué pasó (al menos ${COMENTARIO_AJUSTE_MIN} letras)`);
  if (esAdmin && password === "") faltan.push("escribir tu contraseña");
  const listo = faltan.length === 0;

  const [state, formAction, pending] = useActionState<AjusteResult | undefined, FormData>(
    async (prev, formData) => {
      try {
        const resultado = await (esAdmin ? registrarAjusteDirectoAction : solicitarAjusteAction)(prev, formData);
        if (resultado.success) {
          // Listo: se limpia lo escrito y se estrena identificador, para no mandar lo mismo dos veces.
          setPiezas("");
          setCorrecta("");
          setMotivo("");
          setComentario("");
          setPassword("");
          setToken(crypto.randomUUID());
        }
        return resultado;
      } catch {
        return { error: "No se pudo completar. Revisa tu conexión e inténtalo de nuevo; si se repite, avisa a soporte." };
      }
    },
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-brand-gray2 p-4 sm:p-5">
      <input type="hidden" name="lote_id" value={loteId || ""} />
      <input type="hidden" name="direccion" value={direccion} />
      <input type="hidden" name="piezas" value={piezasValidas ? n : ""} />
      <input type="hidden" name="token" value={token} />
      {/* El motivo viaja en un campo propio: tras un envío fallido el navegador reinicia los radios
          del formulario y, si el motivo dependiera de ellos, la siguiente vez saldría vacío. */}
      <input type="hidden" name="motivo" value={motivo} />
      {/* En "dejar la existencia exacta" el servidor comprueba que nada haya movido ese número. */}
      {modo === "fijar" && lote && <input type="hidden" name="existencia_esperada" value={lote.stock} />}

      {/* Paso 1 */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-brand-gold">1. ¿Dónde y de qué precio?</legend>
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-brand-cream/70">
            Lugar
            <select
              value={sucursalId || ""}
              onChange={(e) => {
                setSucursalId(Number(e.target.value));
                setLoteId(0);
              }}
              className={campo}
            >
              <option value="">Elige el lugar…</option>
              {lugares.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-brand-cream/70">
            Precio
            <select
              value={loteId || ""}
              onChange={(e) => setLoteId(Number(e.target.value))}
              disabled={!sucursalId}
              className={`${campo} disabled:opacity-50`}
            >
              <option value="">{sucursalId ? "Elige el precio…" : "Primero elige el lugar"}</option>
              {delLugar.map((l) => (
                <option key={l.id} value={l.id}>
                  ${miles(l.precio)} — hay {miles(l.stock)} piezas
                </option>
              ))}
            </select>
          </label>
        </div>
        {lote && (
          <p className="text-sm text-brand-cream/80">
            En el sistema hay <strong className="text-brand-gold">{miles(lote.stock)}</strong> piezas de $
            {miles(lote.precio)} en {lote.lugar}.
          </p>
        )}
      </fieldset>

      {/* Paso 2 */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-brand-gold">2. ¿Qué hay que hacer?</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["resta", "Quitar piezas"],
              ["suma", "Agregar piezas"],
              ["fijar", "Dejar la existencia en un número exacto"],
            ] as const
          ).map(([valor, texto]) => (
            <label
              key={valor}
              className={`cursor-pointer rounded-2xl border px-4 py-2 text-sm ${focoEtiqueta} ${
                modo === valor
                  ? "border-brand-gold bg-brand-gold/15 text-brand-gold"
                  : "border-white/10 text-brand-cream/80 hover:border-brand-gold/60"
              }`}
            >
              <input
                type="radio"
                name="modo_opcion"
                value={valor}
                checked={modo === valor}
                onChange={() => setModo(valor)}
                className="sr-only"
              />
              {texto}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {modo === "fijar" ? (
            <label className="flex flex-col gap-1 text-xs text-brand-cream/70">
              La existencia correcta es
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={correcta}
                onChange={(e) => setCorrecta(e.target.value)}
                className={`${campo} w-40`}
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-xs text-brand-cream/70">
              Piezas a {modo === "suma" ? "agregar" : "quitar"}
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={piezas}
                onChange={(e) => setPiezas(e.target.value)}
                className={`${campo} w-40`}
              />
            </label>
          )}
          {/* Vista previa y avisos: se anuncian a los lectores de pantalla al cambiar. */}
          <div role="status" aria-live="polite" className="pb-2 text-sm">
            {lote && piezasValidas && quedara !== null && !sobrepasa && (
              <p className="text-brand-cream/80">
                Hay {miles(lote.stock)} →{" "}
                <strong className={direccion === "resta" ? "text-brand-red" : "text-brand-green"}>
                  {direccion === "resta" ? "−" : "+"}
                  {miles(n)}
                </strong>{" "}
                → quedarán <strong className="text-brand-gold">{miles(quedara)}</strong>
              </p>
            )}
            {sobrepasa && lote && (
              <p className="text-brand-red">
                Solo hay {miles(lote.stock)} piezas: no se pueden quitar {miles(n)}.
              </p>
            )}
            {objetivoInvalido && (
              <p className="text-brand-red">Escribe un número entero, de 0 en adelante.</p>
            )}
            {n > PIEZAS_AJUSTE_MAX && (
              <p className="text-brand-red">
                Un ajuste no puede pasar de {miles(PIEZAS_AJUSTE_MAX)} piezas. Revisa la cantidad.
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {/* Paso 3 */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-brand-gold">3. ¿Qué fue lo que pasó?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MOTIVOS_AJUSTE.map((m) => (
            <label
              key={m.valor}
              className={`flex cursor-pointer flex-col rounded-xl border px-3 py-2 text-sm ${focoEtiqueta} ${
                motivo === m.valor
                  ? "border-brand-gold bg-brand-gold/10"
                  : "border-white/10 hover:border-brand-gold/60"
              }`}
            >
              <input
                type="radio"
                name="motivo_opcion"
                value={m.valor}
                checked={motivo === m.valor}
                onChange={() => setMotivo(m.valor)}
                className="sr-only"
              />
              <span className={motivo === m.valor ? "font-semibold text-brand-gold" : "text-brand-cream"}>
                {m.etiqueta}
              </span>
              <span className="text-xs text-brand-cream/70">{m.ayuda}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Paso 4 */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-brand-gold">4. Cuéntalo con tus palabras</legend>
        <label className="flex flex-col gap-1 text-xs text-brand-cream/70">
          Comentario (obligatorio): qué pasó, quién lo notó y cómo se dio cuenta
          <textarea
            name="comentario"
            required
            rows={3}
            maxLength={COMENTARIO_AJUSTE_MAX}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Ej. Al contar el estante vimos 12 piezas de más porque el lunes se capturaron 120 en vez de 12."
            className={campo}
          />
        </label>
        <p className={`text-xs ${comentarioOk ? "text-brand-cream/70" : "text-brand-red"}`}>
          {largoTexto(comentario.trim())}/{COMENTARIO_AJUSTE_MAX} · mínimo {COMENTARIO_AJUSTE_MIN} letras
        </p>
      </fieldset>

      {esAdmin && (
        <label className="flex flex-col gap-1 text-xs text-brand-cream/70">
          Tu contraseña (para confirmar)
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${campo} w-56`}
          />
        </label>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || !listo}
            aria-describedby="faltan-ajuste"
            className={`rounded-full bg-brand-gold px-6 py-2 text-sm font-semibold text-brand-black transition-opacity disabled:opacity-40 ${foco}`}
          >
            {pending ? "Enviando…" : esAdmin ? "Registrar el ajuste" : "Enviar solicitud al administrador"}
          </button>
          {!esAdmin && (
            <p className="text-xs text-brand-cream/70">
              Las existencias no cambian hasta que la administración la autorice.
            </p>
          )}
        </div>
        <p id="faltan-ajuste" className="text-xs text-brand-cream/70">
          {listo ? "Todo listo para enviar." : `Falta: ${faltan.join(", ")}.`}
        </p>
      </div>

      <div aria-live="polite">
        {state?.error && (
          <p role="alert" className="text-sm text-brand-red">
            {state.error}
          </p>
        )}
        {state?.success && <p className="text-sm text-brand-green">{state.success}</p>}
      </div>
    </form>
  );
}
