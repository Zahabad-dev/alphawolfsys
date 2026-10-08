import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Header from "@/components/Header";
import SalidaForm from "./salida-form";

export default async function SalidaPage() {
  const session = await auth();
  if (session?.user.rol !== "vendedor") redirect("/venta");

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Registrar salida" subtitulo="Regalo, saldo, merma, muestra…" />
      <main className="flex flex-1 flex-col items-center gap-4 p-4">
        <a
          href="/venta"
          className="self-start rounded-full border border-white/20 px-4 py-1.5 text-sm text-brand-cream/80"
        >
          ← Volver
        </a>
        <SalidaForm />
      </main>
    </div>
  );
}
