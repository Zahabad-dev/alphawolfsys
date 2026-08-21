"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import ContarPiezasForm from "./contar-piezas-form";
import { buscarEnCatalogo, guardarCatalogo, type CatalogoItem } from "@/lib/offline-db";

export default function ConfirmarCliente() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [estado, setEstado] = useState<"cargando" | "listo" | "no-encontrado">("cargando");
  const [item, setItem] = useState<CatalogoItem | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let cancelado = false;

    (async () => {
      if (!token) {
        setEstado("no-encontrado");
        return;
      }

      const local = await buscarEnCatalogo(token);
      if (local) {
        if (!cancelado) {
          setItem(local);
          setEstado("listo");
        }
        return;
      }

      // No está en el catálogo guardado — si hay señal, refrescamos e
      // intentamos de nuevo antes de rendirnos.
      try {
        const res = await fetch("/api/venta/catalogo");
        if (res.ok) {
          const data = await res.json();
          await guardarCatalogo(data.items);
          const encontrado = await buscarEnCatalogo(token);
          if (!cancelado) {
            if (encontrado) {
              setItem(encontrado);
              setEstado("listo");
            } else {
              setEstado("no-encontrado");
            }
          }
          return;
        }
      } catch {
        // sin señal — no se pudo refrescar
      }

      if (!cancelado) setEstado("no-encontrado");
    })();

    return () => {
      cancelado = true;
    };
  }, [token]);

  if (estado === "cargando") {
    return (
      <div className="flex min-h-screen flex-col">
        <Header titulo="Confirmar venta" />
        <main className="flex flex-1 flex-col items-center justify-center p-4">
          <p className="text-brand-cream/60">Buscando precio...</p>
        </main>
      </div>
    );
  }

  if (estado === "no-encontrado" || !item) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header titulo="Confirmar venta" />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
          <p className="text-brand-red">
            No tengo este precio guardado. Conéctate una vez con señal para actualizar el
            catálogo de tu sucursal, o revisa que el QR sea de tu propia sucursal.
          </p>
          <a href="/venta" className="text-brand-gold underline">
            Volver
          </a>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Confirmar venta" />
      <main className="flex flex-1 flex-col items-center justify-center p-4">
        <ContarPiezasForm
          qrToken={token}
          idempotencyKey={idempotencyKey}
          precio={item.precio}
          nombre={item.nombre}
          stockReferencia={item.stock}
        />
      </main>
    </div>
  );
}
