"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QrScanner from "qr-scanner";
import { extraerToken } from "@/lib/qr-token";
import { MINIMO_VENTA_MAYOREO } from "@/lib/constants";
import {
  registrarPiezaVentaAction,
  deshacerUltimaPiezaAction,
  cancelarVentaAction,
} from "@/app/venta/actions";

const COOLDOWN_MS = 900;

export default function ContarPiezasForm({
  qrToken,
  ventaId,
  precio,
  stockInicial,
}: {
  qrToken: string;
  ventaId: string;
  precio: number;
  stockInicial: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const bloqueadoRef = useRef(false);
  const router = useRouter();

  const [piezas, setPiezas] = useState(0);
  const [stockRestante, setStockRestante] = useState(stockInicial);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finalizado, setFinalizado] = useState(false);

  useEffect(() => {
    if (finalizado || !videoRef.current) return;

    const scanner = new QrScanner(
      videoRef.current,
      async (result) => {
        if (bloqueadoRef.current) return;

        const token = extraerToken(result.data);
        if (token !== qrToken) {
          setAviso("Ese código no es esta prenda — sigue escaneando la misma.");
          return;
        }

        bloqueadoRef.current = true;
        setBusy(true);
        setAviso(null);

        const respuesta = await registrarPiezaVentaAction({
          qrToken,
          ventaId,
          idempotencyKey: crypto.randomUUID(),
        });

        if (respuesta.error) {
          setAviso(respuesta.error);
        } else if (respuesta.success) {
          setPiezas(respuesta.success.piezas);
          setStockRestante(respuesta.success.stockRestante);
        }

        setBusy(false);
        setTimeout(() => {
          bloqueadoRef.current = false;
        }, COOLDOWN_MS);
      },
      { highlightScanRegion: true, highlightCodeOutline: true }
    );
    scannerRef.current = scanner;

    scanner.start().catch(() => {
      setAviso("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
    });

    return () => {
      scanner.stop();
      scanner.destroy();
    };
  }, [qrToken, ventaId, finalizado]);

  async function quitarUltimaPieza() {
    setBusy(true);
    const respuesta = await deshacerUltimaPiezaAction({ ventaId });
    if (respuesta.error) {
      setAviso(respuesta.error);
    } else if (respuesta.success) {
      setPiezas(respuesta.success.piezas);
      setStockRestante((s) => s + 1);
    }
    setBusy(false);
  }

  async function cancelarVenta() {
    setBusy(true);
    await cancelarVentaAction({ ventaId });
    router.push("/venta");
  }

  const total = piezas * precio;
  const faltan = Math.max(0, MINIMO_VENTA_MAYOREO - piezas);

  if (finalizado) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-brand-gray2 p-8 text-center">
        <p className="text-xl text-brand-gold">Venta registrada</p>
        <p className="text-brand-cream">
          {piezas} piezas × ${precio.toFixed(2)} = ${total.toFixed(2)}
        </p>
        <a
          href="/venta/escanear"
          className="mt-2 rounded-full bg-brand-gold px-6 py-2 font-semibold text-brand-black"
        >
          Nueva venta
        </a>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <video ref={videoRef} className="w-full rounded-2xl border border-white/10" />

      <div className="rounded-2xl border border-white/10 bg-brand-gray2 p-4 text-center">
        <p className="text-2xl font-semibold text-brand-gold">${precio.toFixed(2)} MXN</p>
        <p className="mt-2 text-4xl font-bold text-brand-cream">{piezas}</p>
        <p className="text-sm text-brand-cream/70">
          piezas contadas {faltan > 0 && `— faltan ${faltan} para el mínimo`}
        </p>
        <p className="mt-2 text-brand-cream">Total: ${total.toFixed(2)}</p>
        <p className="text-xs text-brand-cream/50">Stock restante: {stockRestante}</p>
      </div>

      {aviso && <p className="text-sm text-brand-red">{aviso}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={quitarUltimaPieza}
          disabled={busy || piezas === 0}
          className="flex-1 rounded-full border border-white/20 px-4 py-2 text-sm text-brand-cream disabled:opacity-40"
        >
          Quitar última pieza
        </button>
        <button
          type="button"
          onClick={cancelarVenta}
          disabled={busy}
          className="flex-1 rounded-full border border-brand-red/60 px-4 py-2 text-sm text-brand-red disabled:opacity-40"
        >
          Cancelar venta
        </button>
      </div>

      <button
        type="button"
        onClick={() => setFinalizado(true)}
        disabled={piezas < MINIMO_VENTA_MAYOREO}
        className="rounded-full bg-brand-gold px-6 py-3 font-semibold text-brand-black transition-opacity disabled:opacity-40"
      >
        Finalizar venta
      </button>
    </div>
  );
}
