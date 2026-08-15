"use client";

import { useState } from "react";

export default function QrControlsForm({
  sizeCm,
  modo,
  copias,
  sizeCmMin,
  sizeCmMax,
  copiasMax,
}: {
  sizeCm: number;
  modo: "unico" | "hoja";
  copias: number;
  sizeCmMin: number;
  sizeCmMax: number;
  copiasMax: number;
}) {
  const [modoSeleccionado, setModoSeleccionado] = useState<"unico" | "hoja">(modo);

  return (
    <form method="get" className="flex flex-wrap items-end gap-3 print:hidden">
      <label className="flex flex-col gap-1 text-sm text-black/70">
        Tamaño (cm)
        <input
          name="size_cm"
          type="number"
          min={sizeCmMin}
          max={sizeCmMax}
          step={0.1}
          defaultValue={sizeCm}
          className="w-24 rounded-lg border border-black/20 px-3 py-2 text-black"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-black/70">
        Impresión
        <select
          name="modo"
          value={modoSeleccionado}
          onChange={(e) => setModoSeleccionado(e.target.value as "unico" | "hoja")}
          className="rounded-lg border border-black/20 px-3 py-2 text-black"
        >
          <option value="unico">Un solo QR</option>
          <option value="hoja">Planilla (hoja completa)</option>
        </select>
      </label>

      {modoSeleccionado === "hoja" && (
        <label className="flex flex-col gap-1 text-sm text-black/70">
          Copias
          <input
            name="copias"
            type="number"
            min={1}
            max={copiasMax}
            step={1}
            defaultValue={copias}
            className="w-24 rounded-lg border border-black/20 px-3 py-2 text-black"
          />
        </label>
      )}

      <button
        type="submit"
        className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white"
      >
        Generar
      </button>
    </form>
  );
}
