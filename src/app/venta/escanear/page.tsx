import Header from "@/components/Header";
import EscanerQr from "./escaner-qr";

export default function EscanearPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Escanear lote" subtitulo="Apunta la cámara al QR" />
      <main className="flex flex-1 flex-col items-center justify-center p-4">
        <EscanerQr />
      </main>
    </div>
  );
}
