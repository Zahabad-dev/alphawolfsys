"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-full bg-black px-6 py-2 text-white print:hidden"
    >
      Imprimir
    </button>
  );
}
