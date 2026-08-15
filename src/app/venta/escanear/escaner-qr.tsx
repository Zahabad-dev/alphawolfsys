"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QrScanner from "qr-scanner";
import { extraerToken } from "@/lib/qr-token";

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
