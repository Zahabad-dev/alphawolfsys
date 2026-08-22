"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-brand-black p-6 text-center">
      <p className="text-xl text-brand-gold">Sin conexión</p>
      <p className="max-w-sm text-brand-cream/70">
        Esta sección necesita internet para funcionar. El registro de ventas sí puede seguir
        trabajando sin señal — vuelve a la pantalla de venta o reintenta cuando tengas conexión.
      </p>
      <div className="flex gap-3">
        <a
          href="/venta"
          className="rounded-full bg-brand-gold px-5 py-2 text-sm font-semibold text-brand-black"
        >
          Ir a Venta
        </a>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-white/20 px-5 py-2 text-sm text-brand-cream"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
