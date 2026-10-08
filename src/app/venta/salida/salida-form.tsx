"use client";

import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { extraerToken } from "@/lib/qr-token";
import { buscarEnCatalogo, guardarCatalogo, type CatalogoItem } from "@/lib/offline-db";
import {
  MOTIVOS_SALIDA,
  NOTA_SALIDA_MAX,
  etiquetaMotivo,
  type MotivoSalida,
} from "@/lib/motivos-salida";
import { dinero } from "@/lib/carrito";
import { enviarSalida } from "../enviar-salida";

// Misma detección que el conteo de ventas: hay que ver varios frames SIN QR antes
// de aceptar la siguiente pieza (evita contar doble si la prenda se queda en cuadro).
const FRAMES_LIBRES_REQUERIDOS = 5;
/** A partir de esta cantidad se pide confirmar (evita 3000 en vez de 30). */
const LIMITE_ALERTA_PIEZAS = 500;

interface SalidaHecha {
  tipo: "registrada" | "guardada-local";
  cantidad: number;
  motivo: MotivoSalida;
  precio: number;
}

/** Busca el precio del QR en el catálogo guardado; si no está y hay señal, lo refresca. */
async function resolverToken(token: string): Promise<CatalogoItem | null> {
  const local = await buscarEnCatalogo(token);
  if (local) return local;
  try {
    const res = await fetch("/api/venta/catalogo");
    if (res.ok) {
      const data = await res.json();
      await guardarCatalogo(data.items);
      return await buscarEnCatalogo(token);
    }
  } catch {
    // sin señal — no se pudo refrescar
  }
  return null;
}

export default function SalidaForm() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const framesSinCodigoRef = useRef(FRAMES_LIBRES_REQUERIDOS);
  const itemRef = useRef<CatalogoItem | null>(null);

  const [item, setItem] = useState<CatalogoItem | null>(null);
  const [piezas, setPiezas] = useState(0);
  const [motivo, setMotivo] = useState<MotivoSalida | null>(null);
  const [nota, setNota] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [hecha, setHecha] = useState<SalidaHecha | null>(null);
  const [confirmadoPara, setConfirmadoPara] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (hecha || !videoRef.current) return;

    async function manejarLectura(token: string) {
      const actual = itemRef.current;

      // Primera lectura: identifica la prenda y cuenta como la primera pieza.
      if (!actual) {
        const encontrada = await resolverToken(token);
        if (!encontrada) {
          setAviso(
            "No tengo este precio guardado. Conéctate una vez con señal para actualizar el catálogo de tu sucursal."
          );
          return;
        }
        if (itemRef.current) return; // otra lectura ya la fijó mientras buscaba
        itemRef.current = encontrada;
        setItem(encontrada);
        setAviso(null);
        setPiezas(1);
        return;
      }

      // Misma prenda: el mismo QR, o una etiqueta de otra sucursal con el mismo precio.
      let mismaPrenda = token === actual.qrToken;
      if (!mismaPrenda) {
        const otro = await buscarEnCatalogo(token);
        mismaPrenda = otro !== null && otro.precio === actual.precio;
      }
      if (mismaPrenda) {
        setAviso(null);
        setPiezas((p) => p + 1);
      } else {
        setAviso("Ese código es de otro precio. Toca «Cambiar prenda» si quieres registrar otra.");
      }
    }

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        const yaSeFueDeCuadro = framesSinCodigoRef.current >= FRAMES_LIBRES_REQUERIDOS;
        framesSinCodigoRef.current = 0;
        const token = extraerToken(result.data);
        if (!token || !yaSeFueDeCuadro) return;
        void manejarLectura(token);
      },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        onDecodeError: () => {
          if (framesSinCodigoRef.current < FRAMES_LIBRES_REQUERIDOS) {
            framesSinCodigoRef.current += 1;
          }
        },
      }
    );

    scanner.start().catch(() => {
      setAviso("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
    });

    return () => {
      scanner.stop();
      scanner.destroy();
    };
  }, [hecha]);

  function cambiarPrenda() {
    itemRef.current = null;
    framesSinCodigoRef.current = 0;
    setItem(null);
    setPiezas(0);
    setAviso(null);
    setConfirmadoPara(null);
  }

  function onCambioPiezas(valor: string) {
    const soloDigitos = valor.replace(/\D/g, "").slice(0, 6);
    setPiezas(soloDigitos === "" ? 0 : Number(soloDigitos));
  }

  let avisoCantidad: string | null = null;
  if (item && piezas > item.stock) {
    avisoCantidad = `Según tu último inventario solo quedan ${item.stock} piezas de este precio.`;
  } else if (piezas >= LIMITE_ALERTA_PIEZAS) {
    avisoCantidad = `Son ${piezas} piezas. ¿Es correcto?`;
  }
  const esperandoConfirmar = avisoCantidad !== null && confirmadoPara === avisoCantidad;

  const notaObligatoria = motivo === "otro";
  const listo =
    item !== null && piezas > 0 && motivo !== null && (!notaObligatoria || nota.trim().length > 0);

  async function registrar() {
    if (!item || !motivo || piezas <= 0 || pending) return;
    if (notaObligatoria && nota.trim().length === 0) return;
    // Con aviso de cantidad, el primer toque solo pide confirmar; el segundo procede.
    if (avisoCantidad && confirmadoPara !== avisoCantidad) {
      setConfirmadoPara(avisoCantidad);
      return;
    }

    setPending(true);
    setAviso(null);
    const envio = await enviarSalida({
      qrToken: item.qrToken,
      cantidad: piezas,
      motivo,
      nota: nota.trim(),
      idempotencyKey,
    });
    if (envio.tipo === "error") {
      setAviso(envio.mensaje);
      setPending(false);
      return;
    }
    setHecha({ tipo: envio.tipo, cantidad: piezas, motivo, precio: item.precio });
    setPending(false);
  }

  if (hecha) {
    const local = hecha.tipo === "guardada-local";
    return (
      <div
        className={`flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border p-8 text-center ${
          local ? "border-yellow-500/40 bg-yellow-500/10" : "border-white/10 bg-brand-gray2"
        }`}
      >
        <p className={`text-xl ${local ? "text-yellow-500" : "text-brand-gold"}`}>
          {local ? "Guardada en el celular" : "Salida registrada"}
        </p>
        <p className="text-brand-cream">
          {hecha.cantidad} {hecha.cantidad === 1 ? "pieza" : "piezas"} × {dinero(hecha.precio)}
        </p>
        <p className="rounded-full border border-brand-gold/50 px-4 py-1 text-sm text-brand-gold">
          {etiquetaMotivo(hecha.motivo)}
        </p>
        <p className="text-sm text-brand-cream/70">
          {local
            ? "Sin señal ahora mismo — se va a sincronizar sola en cuanto haya conexión, no hace falta que hagas nada más."
            : "Ya se descontó de tu inventario."}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <a
            href="/venta/salida"
            className="rounded-full bg-brand-gold px-6 py-2 font-semibold text-brand-black"
          >
            Registrar otra salida
          </a>
          <a
            href="/venta"
            className="rounded-full border border-white/20 px-6 py-2 text-brand-cream/80"
          >
            Volver al inicio
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <video
        ref={videoRef}
        className="aspect-[4/3] w-full max-w-[16rem] self-center rounded-2xl border border-white/10 object-cover"
      />

      {!item ? (
        <p className="rounded-2xl border border-white/10 bg-brand-gray2 p-4 text-center text-sm text-brand-cream/70">
          Apunta la cámara al QR de la prenda que va a salir.
        </p>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-brand-gray2 p-4 text-center">
          <p className="text-2xl font-semibold text-brand-gold">{dinero(item.precio)} MXN</p>
          <input
            aria-label="Piezas que salen"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={piezas === 0 ? "" : String(piezas)}
            onChange={(e) => onCambioPiezas(e.target.value)}
            className="mt-2 w-full rounded-lg bg-transparent text-center text-4xl font-bold text-brand-cream outline-none placeholder:text-brand-cream/30 focus:bg-brand-black/40"
          />
          <p className="text-sm text-brand-cream/70">piezas · escanea cada una o escribe el total</p>
          <p className="mt-2 text-xs text-brand-cream/50">
            Último stock conocido: {item.stock} (puede no estar al día)
          </p>
          <div className="mt-3 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setPiezas((p) => Math.max(0, p - 1))}
              disabled={pending || piezas === 0}
              className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-brand-cream disabled:opacity-40"
            >
              Quitar una pieza
            </button>
            <button
              type="button"
              onClick={cambiarPrenda}
              disabled={pending}
              className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-brand-cream disabled:opacity-40"
            >
              Cambiar prenda
            </button>
          </div>
        </div>
      )}

      <fieldset className="flex flex-col gap-2" disabled={pending}>
        <legend className="mb-1 text-sm text-brand-cream/70">¿Qué pasó con la prenda?</legend>
        <div className="grid grid-cols-2 gap-2">
          {MOTIVOS_SALIDA.map((m) => {
            const activo = motivo === m.valor;
            return (
              <button
                key={m.valor}
                type="button"
                aria-pressed={activo}
                onClick={() => setMotivo(m.valor)}
                className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                  activo
                    ? "border-brand-gold bg-brand-gold text-brand-black"
                    : "border-white/15 bg-brand-gray2 text-brand-cream"
                }`}
              >
                <span className="block text-sm font-semibold">{m.etiqueta}</span>
                <span className={`block text-[11px] ${activo ? "text-brand-black/70" : "text-brand-cream/50"}`}>
                  {m.ayuda}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <input
        aria-label="Nota de la salida"
        type="text"
        maxLength={NOTA_SALIDA_MAX}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        disabled={pending}
        placeholder={
          notaObligatoria ? "¿Cuál es el motivo? (obligatorio)" : "Detalle opcional (a quién, por qué…)"
        }
        className="rounded-lg border border-white/10 bg-brand-gray2 px-3 py-2 text-sm text-brand-cream outline-none focus:border-brand-gold"
      />

      {avisoCantidad && (
        <p className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-500">
          ⚠ {avisoCantidad}
        </p>
      )}
      {aviso && <p className="text-sm text-brand-red">{aviso}</p>}

      <button
        type="button"
        onClick={registrar}
        disabled={pending || !listo}
        className="rounded-full bg-brand-gold px-6 py-3 font-semibold text-brand-black transition-opacity disabled:opacity-40"
      >
        {pending ? "Registrando..." : esperandoConfirmar ? "Toca otra vez para confirmar" : "Registrar salida"}
      </button>
      <a
        href="/venta"
        className="rounded-full border border-white/15 px-4 py-2 text-center text-sm text-brand-cream/70"
      >
        Cancelar
      </a>
    </div>
  );
}
