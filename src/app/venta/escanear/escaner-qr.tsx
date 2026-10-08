"use client";

import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { extraerToken } from "@/lib/qr-token";
import { leerCarrito, quitarDelCarrito, useCarrito, vaciarCarrito } from "@/lib/carrito";
import { enviarVenta, type EnvioResultado } from "../enviar-venta";
import ResumenVenta from "../resumen-venta";
import ResultadoVenta from "../resultado-venta";

type ResultadoFinal = Extract<EnvioResultado, { tipo: "registrada" | "guardada-local" }>;

export default function EscanerQr() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resultado, setResultado] = useState<ResultadoFinal | null>(null);
  const carrito = useCarrito();

  useEffect(() => {
    if (resultado || !videoRef.current) return;

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        const token = extraerToken(result.data);
        if (token) {
          scanner.stop();
          // Navegación de página completa (no router.push): sin señal, la
          // transición de Next.js pide un payload aparte que nunca quedó en
          // caché y el navegador termina mostrando su propio error de "sin
          // conexión". Una navegación real sí pasa por el service worker.
          window.location.href = `/venta/confirmar?token=${encodeURIComponent(token)}`;
        }
      },
      { highlightScanRegion: true, highlightCodeOutline: true }
    );
    scannerRef.current = scanner;

    scanner.start().catch(() => {
      setError("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
    });

    return () => {
      scanner.stop();
      scanner.destroy();
    };
  }, [resultado]);

  async function finalizar() {
    if (pending || carrito.lineas.length === 0) return;
    setPending(true);
    setError(null);

    const envio = await enviarVenta(leerCarrito());
    if (envio.tipo === "error") {
      setError(`${envio.mensaje} Quita esa línea con ✕ y vuelve a finalizar.`);
      setPending(false);
      return;
    }

    vaciarCarrito();
    setResultado(envio);
    setPending(false);
  }

  function cancelar() {
    if (!window.confirm("¿Cancelar toda la venta? Se pierde lo que llevas.")) return;
    vaciarCarrito();
  }

  if (resultado) return <ResultadoVenta resultado={resultado} />;

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <video
        ref={videoRef}
        className="aspect-[4/3] w-full max-w-[16rem] self-center rounded-2xl border border-white/10 object-cover"
      />
      {carrito.lineas.length > 0 && (
        <p className="text-center text-sm text-brand-cream/70">
          Escanea otro precio para agregarlo, o finaliza la venta.
        </p>
      )}
      {error && <p className="text-sm text-brand-red">{error}</p>}

      <ResumenVenta lineas={carrito.lineas} onQuitar={quitarDelCarrito} />

      {carrito.lineas.length > 0 && (
        <div className="flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={finalizar}
            disabled={pending}
            className="rounded-full bg-brand-gold px-6 py-3 font-semibold text-brand-black transition-opacity disabled:opacity-40"
          >
            {pending ? "Registrando..." : "Finalizar venta"}
          </button>
          <button
            type="button"
            onClick={cancelar}
            disabled={pending}
            className="rounded-full border border-brand-red/60 px-4 py-2 text-sm text-brand-red disabled:opacity-40"
          >
            Cancelar venta
          </button>
        </div>
      )}
    </div>
  );
}
