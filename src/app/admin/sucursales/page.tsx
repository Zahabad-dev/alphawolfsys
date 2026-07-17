import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import SucursalRowForm from "./sucursal-row-form";
import { toggleSucursalActivaAction } from "./actions";

interface SucursalRow {
  id: number;
  clave: string;
  nombre: string;
  estado: string;
  activa: boolean;
}

export default async function AdminSucursalesPage() {
  const session = await auth();
  if (!session || session.user.rol !== "admin") redirect("/login");

  const { rows: sucursales } = await query<SucursalRow>(
    "SELECT id, clave, nombre, estado, activa FROM sucursales ORDER BY nombre"
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Sucursales" subtitulo="Edición de las 3 sucursales existentes" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <p className="text-sm text-brand-cream/50">
          Las sucursales se gestionan aquí, pero no se pueden crear nuevas desde la app.
        </p>
        {sucursales.map((s) => (
          <div
            key={s.id}
            className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4 sm:flex-row sm:items-end sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-brand-cream/60">
                {s.clave}
              </span>
              <SucursalRowForm id={s.id} nombre={s.nombre} estado={s.estado} />
            </div>
            <form action={toggleSucursalActivaAction}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="activa" value={String(s.activa)} />
              <button
                type="submit"
                className="text-sm text-brand-cream/70 underline hover:text-brand-gold"
              >
                {s.activa ? "Desactivar" : "Activar"}
              </button>
            </form>
          </div>
        ))}
      </main>
    </div>
  );
}
