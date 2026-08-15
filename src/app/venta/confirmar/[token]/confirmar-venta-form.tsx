"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { registrarVentaAction, type RegistrarVentaResult } from "@/app/venta/actions";
import { MINIMO_VENTA_MAYOREO } from "@/lib/constants";

export default function ConfirmarVentaForm({
  qrToken,
  idempotencyKey,
  precio,
  stock,
}: {
  qrToken: string;
  idempotencyKey: string;
  precio: number;
  stock: number;
}) {
  const [state, formAction, pending] = useActionState<RegistrarVentaResult | undefined, FormData>(
    registrarVentaAction,
    undefined
  );
  const [cantidad, setCantidad] = useState("");

  const total = useMemo(() => {
    const n = Number(cantidad);
    return Number.isFinite(n) && n > 0 ? n * precio : 0;
  }, [cantidad, precio]);

  if (state?.success) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-brand-gray2 p-8 text-center">
        <p className="text-xl text-brand-gold">Venta registrada</p>
        <p className="text-brand-cream">
          {state.success.cantidad} piezas × ${precio.toFixed(2)} = $
          {state.success.total.toFixed(2)}
        </p>
        <Link
          href="/venta"
          className="mt-2 rounded-full bg-brand-gold px-6 py-2 font-semibold text-brand-black"
        >
          Nueva venta
        </Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-brand-gray2 p-8"
    >
      <input type="hidden" name="qr_token" value={qrToken} />
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />

      <p className="text-2xl font-semibold text-brand-gold">${precio.toFixed(2)} MXN</p>
      <p className="text-brand-cream/80">Stock disponible: {stock}</p>

      <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
        Cantidad de piezas (mínimo {MINIMO_VENTA_MAYOREO})
        <input
          name="cantidad"
          type="number"
          min={MINIMO_VENTA_MAYOREO}
          step="1"
          required
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
        />
      </label>

      <p className="text-lg text-brand-cream">Total: ${total.toFixed(2)}</p>

      {state?.error && <p className="text-sm text-brand-red">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-gold px-6 py-2 font-semibold text-brand-black transition-opacity disabled:opacity-60"
      >
        {pending ? "Registrando..." : "Registrar venta"}
      </button>
    </form>
  );
}
