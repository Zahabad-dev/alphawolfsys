import Header from "@/components/Header";
import EscanerQr from "./escaner-qr";

export default function EscanearPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Escanear lote" subtitulo="Apunta la cámara al QR" />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
        <a
          href="/venta"
          className="self-start rounded-full border border-white/20 px-4 py-1.5 text-sm text-brand-cream/80"
        >
          ← Volver
        </a>
        <EscanerQr />
      </main>
    </div>
  );
}
