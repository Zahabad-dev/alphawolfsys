"use client";

import { useCallback, useEffect, useState } from "react";
import { registrarVentaAction, reportarVentaOfflineFallidaAction } from "./actions";
import { guardarCatalogo, listarCola, eliminarDeCola } from "@/lib/offline-db";

export default function Sincronizar() {
  const [pendientes, setPendientes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);

  const refrescarCatalogo = useCallback(async () => {
    try {
      const res = await fetch("/api/venta/catalogo");
      if (res.ok) {
        const data = await res.json();
        await guardarCatalogo(data.items);
      }
    } catch {
      // sin señal, el catálogo se queda como estaba
    }
  }, []);

  const sincronizarCola = useCallback(async () => {
    const cola = await listarCola();
    setPendientes(cola.length);
    if (cola.length === 0) return;

    setSincronizando(true);
    for (const venta of cola) {
      try {
        const respuesta = await registrarVentaAction({
          qrToken: venta.qrToken,
          cantidad: venta.cantidad,
          idempotencyKey: venta.idempotencyKey,
        });
        if (respuesta.error) {
          await reportarVentaOfflineFallidaAction({
            qrToken: venta.qrToken,
            cantidad: venta.cantidad,
            mensaje: respuesta.error,
          });
        }
        // Éxito o rechazo definitivo: en ambos casos ya no se reintenta.
        if (venta.id !== undefined) await eliminarDeCola(venta.id);
      } catch {
        // Sin señal todavía — se queda en la cola para el próximo intento.
      }
    }
    setSincronizando(false);
    const restante = await listarCola();
    setPendientes(restante.length);
  }, []);

  useEffect(() => {
    const ejecutar = async () => {
      await refrescarCatalogo();
      await sincronizarCola();
    };
    void ejecutar();

    const onOnline = () => void ejecutar();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refrescarCatalogo, sincronizarCola]);

  if (pendientes === 0) return null;

  return (
    <div className="w-full max-w-sm rounded-2xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-center text-sm text-yellow-500">
      {sincronizando
        ? `Sincronizando ${pendientes} venta${pendientes > 1 ? "s" : ""} pendiente${pendientes > 1 ? "s" : ""}...`
        : `${pendientes} venta${pendientes > 1 ? "s" : ""} guardada${pendientes > 1 ? "s" : ""} sin sincronizar`}
    </div>
  );
}
