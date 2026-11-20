"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  AJUSTES_INICIALES,
  type AjustesZendio,
  cabeceraTspl,
  dibujarFilas,
  enviarBluetooth,
  enviarUsb,
  filasATspl,
  guardarAjustes,
  hayBluetooth,
  hayUsb,
  imprimirPorPagina,
  leerAjustes,
  normalizar,
  porLotes,
  unir,
} from "@/lib/zendio";

const campo = "rounded-lg border border-black/20 px-2 py-1 text-black outline-none focus:border-black";
const boton = "rounded-full border border-black/20 px-4 py-1.5 text-sm text-black hover:border-black disabled:opacity-40";

interface Props {
  token: string;
  texto: string;
  precio: string | null;
  familiaLetra: string;
  copiasIniciales: number;
}

const sinSuscripcion = () => () => {};

/** Solo en el navegador (los ajustes de la impresora viven en este aparato). */
export default function ImprimirZendio(props: Props) {
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  if (!montado) return null;
  return <PanelZendio {...props} />;
}

function PanelZendio({ token, texto, precio, familiaLetra, copiasIniciales }: Props) {
  const [ajustes, setAjustes] = useState<AjustesZendio>(leerAjustes);
  const [piezas, setPiezas] = useState(String(Math.max(1, copiasIniciales)));
  const [vista, setVista] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [verAjustes, setVerAjustes] = useState(false);
  // Lo que se ve escrito en cada medida (se puede borrar y reescribir sin que el valor se vuelva 0).
  const [textos, setTextos] = useState<Partial<Record<keyof AjustesZendio, string>>>({});
  const [avance, setAvance] = useState<string | null>(null);
  const ble = hayBluetooth();
  const usb = hayUsb();

  const n = /^[1-9]\d{0,3}$/.test(piezas.trim()) ? Number(piezas) : 0;
  const datos = { token, texto, precio };

  // Vista previa de una fila (como saldrá en el rollo).
  useEffect(() => {
    let cancelado = false;
    dibujarFilas(Array(ajustes.columnas).fill(datos), ajustes, familiaLetra)
      .then((f) => {
        if (!cancelado) setVista(f[0]?.toDataURL("image/png") ?? null);
      })
      .catch(() => {
        if (!cancelado) setVista(null);
      });
    return () => {
      cancelado = true;
    };
    // datos se arma de token/texto/precio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ajustes, token, texto, precio, familiaLetra]);

  const cambiar = <K extends keyof AjustesZendio>(k: K, v: AjustesZendio[K]) => {
    const nuevo = normalizar({ ...ajustes, [k]: v });
    setAjustes(nuevo);
    guardarAjustes(nuevo);
  };

  async function correr(via: "pc" | "ble" | "usb", cuantas: number) {
    if (!cuantas) return setMensaje({ tipo: "error", texto: "Escribe cuántas etiquetas (1 a 9999)." });
    setOcupado(true);
    setMensaje(null);
    const etiquetas = Array(cuantas).fill(datos);
    const filasTotal = Math.ceil(cuantas / ajustes.columnas);
    const preparando = (h: number, t: number) => setAvance(`Preparando ${h} de ${t} etiquetas…`);
    try {
      if (via === "pc") {
        // Cada fila se convierte a imagen en cuanto se dibuja (no se guardan cientos de lienzos a la vez).
        const imagenes = (await porLotes(etiquetas, ajustes, familiaLetra, (f) => f.map((c) => c.toDataURL("image/png")), preparando)).flat();
        imprimirPorPagina(imagenes, ajustes);
        setMensaje({ tipo: "ok", texto: "En la ventana de impresión elige la Zendio, tamaño «Real / 100 %» y márgenes «Ninguno»." });
      } else {
        const lotes = await porLotes(etiquetas, ajustes, familiaLetra, (f) => filasATspl(f, ajustes), preparando);
        const tspl = unir([cabeceraTspl(ajustes), ...lotes]);
        const enviando = (e: number, t: number) => setAvance(`Enviando a la impresora… ${Math.round((e / t) * 100)} %`);
        const nombre = via === "ble" ? await enviarBluetooth(tspl, enviando) : await enviarUsb(tspl);
        if (nombre) {
          setMensaje({
            tipo: "ok",
            texto: `Enviado a ${nombre}: ${cuantas} ${cuantas === 1 ? "etiqueta" : "etiquetas"} (${filasTotal} ${filasTotal === 1 ? "fila" : "filas"}).`,
          });
        }
      }
    } catch (e) {
      setMensaje({ tipo: "error", texto: e instanceof Error && e.message ? e.message : "No se pudo imprimir." });
    } finally {
      setAvance(null);
      setOcupado(false);
    }
  }

  const numero = (k: keyof AjustesZendio, etiqueta: string, paso = 0.1) => (
    <label className="flex flex-col gap-1 text-xs text-black/70">
      {etiqueta}
      <input
        type="text"
        inputMode="decimal"
        value={textos[k] ?? String(ajustes[k])}
        onChange={(e) => {
          const v = e.target.value;
          setTextos((t) => ({ ...t, [k]: v }));
          // Solo se aplica cuando es un número válido; mientras se escribe no se rompe nada.
          if (v.trim() !== "" && Number.isFinite(Number(v))) cambiar(k, (paso === 1 ? Math.round(Number(v)) : Number(v)) as never);
        }}
        onBlur={() => setTextos((t) => ({ ...t, [k]: undefined }))}
        className={`${campo} w-24`}
      />
    </label>
  );

  return (
    <section className="flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-black/10 p-4 print:hidden">
      <h2 className="text-base font-semibold">Imprimir en la Zendio (rollo 1×1, {ajustes.columnas} por fila)</h2>
      {vista && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={vista} alt="Vista previa de una fila del rollo" className="w-full max-w-md border border-dashed border-black/30" style={{ imageRendering: "pixelated" }} />
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-black/70">
          Etiquetas
          <input value={piezas} onChange={(e) => setPiezas(e.target.value)} inputMode="numeric" className={`${campo} w-24`} />
        </label>
        <button type="button" disabled={ocupado} onClick={() => correr("pc", n)} className={boton}>
          Imprimir desde PC
        </button>
        {ble && (
          <button type="button" disabled={ocupado} onClick={() => correr("ble", n)} className={boton}>
            Imprimir por Bluetooth
          </button>
        )}
        {usb && (
          <button type="button" disabled={ocupado} onClick={() => correr("usb", n)} className={boton}>
            Imprimir por cable USB
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-black/70">Calibrar:</span>
        <button type="button" disabled={ocupado} onClick={() => correr("pc", ajustes.columnas)} className={boton}>
          Fila de prueba (PC)
        </button>
        {ble && (
          <button type="button" disabled={ocupado} onClick={() => correr("ble", ajustes.columnas)} className={boton}>
            Fila de prueba (Bluetooth)
          </button>
        )}
        {usb && (
          <button type="button" disabled={ocupado} onClick={() => correr("usb", ajustes.columnas)} className={boton}>
            Fila de prueba (USB)
          </button>
        )}
        <button type="button" onClick={() => setVerAjustes((v) => !v)} className="text-black/70 underline">
          {verAjustes ? "Ocultar medidas" : "Medidas del rollo y ajuste fino"}
        </button>
      </div>
      {verAjustes && (
        <div className="flex flex-col gap-3 rounded-xl bg-black/5 p-3">
          <div className="flex flex-wrap gap-3">
            {numero("anchoMm", "Ancho etiqueta (mm)")}
            {numero("altoMm", "Alto etiqueta (mm)")}
            {numero("columnas", "Columnas", 1)}
            {numero("gapColMm", "Entre columnas (mm)")}
            {numero("gapFilaMm", "Entre filas (mm)")}
            {numero("margenIzqMm", "Margen lateral (mm)")}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {numero("ajusteXMm", "Mover → (mm)")}
            {numero("ajusteYMm", "Mover ↓ (mm)")}
            <label className="flex items-center gap-2 pb-1 text-xs text-black/70">
              <input type="checkbox" checked={ajustes.invertir} onChange={(e) => cambiar("invertir", e.target.checked)} />
              Sale en negativo (invertir)
            </label>
            <button
              type="button"
              onClick={() => {
                setAjustes(AJUSTES_INICIALES);
                setTextos({});
                guardarAjustes(AJUSTES_INICIALES);
              }}
              className="pb-1 text-xs text-black/70 underline"
            >
              Volver a medidas de fábrica
            </button>
          </div>
          <p className="text-xs text-black/60">
            Se guardan en este aparato. Imprime una fila de prueba y mueve el contenido hasta que quede centrado en la
            etiqueta. En PC, el tamaño de papel del driver de la Zendio debe ser igual al de una fila del rollo.
          </p>
        </div>
      )}
      <div aria-live="polite" aria-busy={ocupado}>
        {avance && <p className="text-sm text-black/70">{avance}</p>}
        {mensaje && (
          <p role={mensaje.tipo === "error" ? "alert" : undefined} className={`text-sm ${mensaje.tipo === "ok" ? "text-green-700" : "text-red-700"}`}>
            {mensaje.texto}
          </p>
        )}
      </div>
    </section>
  );
}
