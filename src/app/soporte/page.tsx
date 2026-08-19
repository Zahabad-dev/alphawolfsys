import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import { marcarResueltoAction } from "./actions";

interface ErrorRow {
  id: number;
  origen: string;
  workflow: string | null;
  mensaje: string;
  detalle: unknown;
  resuelto: boolean;
  creado_en: string;
}

export default async function SoportePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") redirect("/login");

  const sp = await searchParams;
  const soloPendientes = sp.todos !== "1";

  const { rows: errores } = await query<ErrorRow>(
    soloPendientes
      ? "SELECT * FROM errores_soporte WHERE resuelto = false ORDER BY creado_en DESC LIMIT 200"
      : "SELECT * FROM errores_soporte ORDER BY creado_en DESC LIMIT 200"
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Soporte" subtitulo="Alertas de errores (n8n y respaldos)" />
      {session.user.rol !== "soporte" && <AdminNav />}
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <a
            href="/soporte"
            className={`rounded-full px-4 py-1.5 text-sm ${soloPendientes ? "bg-brand-gold text-brand-black" : "border border-white/10 text-brand-cream/70"}`}
          >
            Pendientes
          </a>
          <a
            href="/soporte?todos=1"
            className={`rounded-full px-4 py-1.5 text-sm ${!soloPendientes ? "bg-brand-gold text-brand-black" : "border border-white/10 text-brand-cream/70"}`}
          >
            Todos
          </a>
        </div>

        {errores.length === 0 && (
          <p className="rounded-2xl border border-white/10 bg-brand-gray2 p-4 text-center text-sm text-brand-cream/50">
            {soloPendientes ? "Sin errores pendientes." : "Sin errores registrados."}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {errores.map((e) => (
            <div
              key={e.id}
              className={`rounded-2xl border p-4 ${e.resuelto ? "border-white/10 bg-brand-gray2" : "border-brand-red/40 bg-brand-red/10"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-brand-cream/50">
                    {new Date(e.creado_en).toLocaleString("es-MX")} · {e.origen}
                    {e.workflow ? ` · ${e.workflow}` : ""}
                  </p>
                  <p className="mt-1 text-brand-cream">{e.mensaje}</p>
                  {e.detalle != null && (
                    <pre className="mt-2 max-w-full overflow-x-auto rounded-lg bg-brand-black p-2 text-xs text-brand-cream/60">
                      {JSON.stringify(e.detalle, null, 2)}
                    </pre>
                  )}
                </div>
                <form action={marcarResueltoAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="resuelto" value={String(e.resuelto)} />
                  <button
                    type="submit"
                    className="whitespace-nowrap rounded-full border border-white/20 px-3 py-1 text-xs text-brand-cream/80 hover:border-brand-gold hover:text-brand-gold"
                  >
                    {e.resuelto ? "Reabrir" : "Marcar resuelto"}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
