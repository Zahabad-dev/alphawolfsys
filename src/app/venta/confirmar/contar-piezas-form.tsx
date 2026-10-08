"use client";

import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { extraerToken } from "@/lib/qr-token";
import { buscarEnCatalogo } from "@/lib/offline-db";
import {
  agregarAlCarrito,
  leerCarrito,
  quitarDelCarrito,
  useCarrito,
  vaciarCarrito,
} from "@/lib/carrito";
import { enviarVenta, type EnvioResultado } from "../enviar-venta";
import ResumenVenta from "../resumen-venta";
import ResultadoVenta from "../resultado-venta";

// En vez de un temporizador fijo entre conteos, se exige que la cámara
// reporte varios frames seguidos SIN ningún QR visible antes de aceptar la
// siguiente pieza — así se cuenta casi al instante en cuanto se retira la
// prenda contada, pero sigue bloqueado si el mismo QR se queda pegado en
// cuadro (la causa real del conteo doble que teníamos antes). A ~25 escaneos
// por segundo (default de qr-scanner), esto equivale a un colchón de
// ~200ms — solo para no confundir un parpadeo de la cámara con "ya se fue".
const FRAMES_LIBRES_REQUERIDOS = 5;
/** A partir de esta cantidad en un solo precio se pide confirmar (evita 3000 en vez de 30). */
const LIMITE_ALERTA_PIEZAS = 500;

type ResultadoFinal = Extract<EnvioResultado, { tipo: "registrada" | "guardada-local" }>;

export default function ContarPiezasForm({
  qrToken,
  precio,
  nombre,
  stockReferencia,
}: {
  qrToken: string;
  precio: number;
  nombre: string;
  stockReferencia: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  // Arranca ya "en cero piezas y listo para contar" — si empezara en 0 la
  // primera pieza tendría que esperar el mismo colchón que las demás, sin
  // necesidad (nunca hubo nada en cuadro antes de la primera lectura).
  const framesSinCodigoRef = useRef(FRAMES_LIBRES_REQUERIDOS);
  const precioRef = useRef(precio);

  const carrito = useCarrito();

  const [piezas, setPiezas] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resultado, setResultado] = useState<ResultadoFinal | null>(null);
  const [confirmadoPara, setConfirmadoPara] = useState<string | null>(null);

  useEffect(() => {
    if (resultado || !videoRef.current) return;

    const contarPieza = () => {
      setAviso(null);
      setPiezas((actual) => actual + 1);
    };

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        // Hay que leer el contador ANTES de reiniciarlo — si no, siempre
        // se leería en 0 (recién puesto en esta misma llamada) y nunca
        // se contaría nada.
        const yaSeFueDeCuadro = framesSinCodigoRef.current >= FRAMES_LIBRES_REQUERIDOS;

        // Se detectó un QR (sea o no el correcto) — ya no está "fuera de
        // cuadro", así que se reinicia el contador de frames libres.
        framesSinCodigoRef.current = 0;

        const token = extraerToken(result.data);
        if (!token) return;

        // Mientras la misma prenda siga pegada en cuadro no se cuenta ni se
        // vuelve a analizar (evita repetir la búsqueda en cada frame).
        if (!yaSeFueDeCuadro) return;

        if (token === qrToken) {
          contarPieza();
          return;
        }

        // Otro código: puede ser una etiqueta de otra sucursal (ej. Almacén) con
        // el MISMO precio — cuenta como la misma prenda. Si es de otro precio, avisa.
        void buscarEnCatalogo(token).then((otro) => {
          if (otro && otro.precio === precioRef.current) {
            contarPieza();
          } else {
            setAviso(
              "Ese código es de otro precio. Si quieres venderlo también, toca «Agregar y escanear otro precio»."
            );
          }
        });
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
    scannerRef.current = scanner;

    scanner.start().catch(() => {
      setAviso("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
    });

    return () => {
      scanner.stop();
      scanner.destroy();
    };
  }, [qrToken, resultado]);

  const item = { qrToken, nombre, precio, stock: stockReferencia };

  const yaEnVenta = carrito.lineas.find((l) => l.precio === precio)?.cantidad ?? 0;
  const disponible = stockReferencia - yaEnVenta;

  let avisoCantidad: string | null = null;
  if (piezas > 0 && piezas > disponible) {
    avisoCantidad = `Según tu último inventario solo quedan ${stockReferencia} piezas de este precio${
      yaEnVenta > 0 ? ` (ya llevas ${yaEnVenta} en esta venta)` : ""
    }.`;
  } else if (piezas >= LIMITE_ALERTA_PIEZAS) {
    avisoCantidad = `Son ${piezas} piezas de un solo precio. ¿Es correcto?`;
  }

  /** Con aviso de cantidad, el primer toque solo pide confirmar; el segundo procede. */
  function pideConfirmar(): boolean {
    if (avisoCantidad && confirmadoPara !== avisoCantidad) {
      setConfirmadoPara(avisoCantidad);
      return true;
    }
    return false;
  }
  const esperandoConfirmar = avisoCantidad !== null && confirmadoPara === avisoCantidad;
  const etiqueta = (base: string) => (esperandoConfirmar ? "Toca otra vez para confirmar" : base);

  function onCambioPiezas(valor: string) {
    const soloDigitos = valor.replace(/\D/g, "").slice(0, 6);
    setPiezas(soloDigitos === "" ? 0 : Number(soloDigitos));
  }

  function quitarUltimaPieza() {
    setPiezas((actual) => Math.max(0, actual - 1));
  }

  function agregarYEscanearOtro() {
    if (pending || piezas <= 0) return;
    if (pideConfirmar()) return;
    agregarAlCarrito(item, piezas);
    window.location.href = "/venta/escanear";
  }

  async function finalizarVenta() {
    if (pending) return;
    const hayConteo = piezas > 0;
    if (!hayConteo && carrito.lineas.length === 0) return;
    if (hayConteo && pideConfirmar()) return;

    setPending(true);
    setAviso(null);

    if (hayConteo) {
      agregarAlCarrito(item, piezas);
      setPiezas(0);
    }

    const envio = await enviarVenta(leerCarrito());
    if (envio.tipo === "error") {
      setAviso(`${envio.mensaje} Ajusta o quita esa línea con ✕ y vuelve a finalizar.`);
      setPending(false);
      return;
    }

    vaciarCarrito();
    setResultado(envio);
    setPending(false);
  }

  function cancelarVenta() {
    const hayAlgo = piezas > 0 || carrito.lineas.length > 0;
    if (hayAlgo && !window.confirm("¿Cancelar toda la venta? Se pierde lo que llevas.")) return;
    vaciarCarrito();
    window.location.href = "/venta";
  }

  if (resultado) return <ResultadoVenta resultado={resultado} />;

  const sinNada = piezas === 0 && carrito.lineas.length === 0;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <video ref={videoRef} className="w-full rounded-2xl border border-white/10" />

      <div className="rounded-2xl border border-white/10 bg-brand-gray2 p-4 text-center">
        <p className="text-2xl font-semibold text-brand-gold">${precio.toFixed(2)} MXN</p>
        <p className="text-xs text-brand-cream/50">{nombre}</p>

        <input
          aria-label="Piezas de este precio"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="0"
          value={piezas === 0 ? "" : String(piezas)}
          onChange={(e) => onCambioPiezas(e.target.value)}
          className="mt-2 w-full rounded-lg bg-transparent text-center text-4xl font-bold text-brand-cream outline-none placeholder:text-brand-cream/30 focus:bg-brand-black/40"
        />
        <p className="text-sm text-brand-cream/70">piezas · escanea cada una o escribe el total</p>
        <p className="mt-2 text-xs text-brand-cream/50">
          Último stock conocido: {stockReferencia} (puede no estar al día)
        </p>
      </div>

      <ResumenVenta
        lineas={carrito.lineas}
        pendiente={{ precio, cantidad: piezas }}
        onQuitar={quitarDelCarrito}
      />

      {avisoCantidad && (
        <p className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-500">
          ⚠ {avisoCantidad}
        </p>
      )}
      {aviso && <p className="text-sm text-brand-red">{aviso}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={quitarUltimaPieza}
          disabled={pending || piezas === 0}
          className="flex-1 rounded-full border border-white/20 px-4 py-2 text-sm text-brand-cream disabled:opacity-40"
        >
          Quitar última pieza
        </button>
        <button
          type="button"
          onClick={cancelarVenta}
          disabled={pending}
          className="flex-1 rounded-full border border-brand-red/60 px-4 py-2 text-sm text-brand-red disabled:opacity-40"
        >
          Cancelar venta
        </button>
      </div>

      <button
        type="button"
        onClick={agregarYEscanearOtro}
        disabled={pending || piezas === 0}
        className="rounded-full border border-brand-gold px-6 py-2.5 text-sm font-semibold text-brand-gold disabled:opacity-40"
      >
        {etiqueta("Agregar y escanear otro precio")}
      </button>

      <button
        type="button"
        onClick={finalizarVenta}
        disabled={pending || sinNada}
        className="rounded-full bg-brand-gold px-6 py-3 font-semibold text-brand-black transition-opacity disabled:opacity-40"
      >
        {pending ? "Registrando..." : etiqueta("Finalizar venta")}
      </button>
    </div>
  );
}
