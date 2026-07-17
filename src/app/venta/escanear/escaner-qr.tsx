"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QrScanner from "qr-scanner";

function extraerToken(texto: string): string | null {
  try {
    const url = new URL(texto);
    const partes = url.pathname.split("/").filter(Boolean);
    const idx = partes.indexOf("scan");
    if (idx !== -1 && partes[idx + 1]) return partes[idx + 1];
    return partes.at(-1) ?? null;
  } catch {
    // No es una URL completa: asumir que el texto ya es el token.
    return texto.trim() || null;
  }
}

export default function EscanerQr() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        const token = extraerToken(result.data);
        if (token) {
          scanner.stop();
          router.push(`/venta/confirmar/${token}`);
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
  }, [router]);

  return (
    <div className="flex flex-col items-center gap-4">
      <video ref={videoRef} className="w-full max-w-sm rounded-2xl border border-white/10" />
      {error && <p className="text-sm text-brand-red">{error}</p>}
    </div>
  );
}
