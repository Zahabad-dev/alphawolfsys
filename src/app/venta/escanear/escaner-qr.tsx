"use client";

import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { extraerToken } from "@/lib/qr-token";

export default function EscanerQr() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;

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
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <video ref={videoRef} className="w-full max-w-sm rounded-2xl border border-white/10" />
      {error && <p className="text-sm text-brand-red">{error}</p>}
    </div>
  );
}
