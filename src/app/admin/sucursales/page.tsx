import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import SucursalRowForm from "./sucursal-row-form";
import NuevaSucursalForm from "./nueva-sucursal-form";
import EliminarSucursalForm from "./eliminar-sucursal-form";
import { toggleSucursalActivaAction } from "./actions";

interface SucursalRow {
  id: number;
  clave: string;
  nombre: string;
  estado: string;
  tipo: string;
  activa: boolean;
}

interface VendedorRow {
  sucursal_id: number;
  username: string;
}

export default async function AdminSucursalesPage() {
  const session = await auth();
  if (!session || session.user.rol !== "admin") redirect("/login");

  const [{ rows: sucursales }, { rows: vendedores }] = await Promise.all([
    query<SucursalRow>("SELECT id, clave, nombre, estado, tipo, activa FROM sucursales ORDER BY tipo, nombre"),
    query<VendedorRow>(
      "SELECT sucursal_id, username FROM usuarios WHERE rol = 'vendedor' AND sucursal_id IS NOT NULL"
    ),
  ]);

  const vendedoresPorSucursal = new Map<number, string[]>();
  for (const v of vendedores) {
    const lista = vendedoresPorSucursal.get(v.sucursal_id) ?? [];
    lista.push(v.username);
    vendedoresPorSucursal.set(v.sucursal_id, lista);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Sucursales" subtitulo="Gestión de sucursales y almacén" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <NuevaSucursalForm />

        {sucursales.map((s) => (
          <div
            key={s.id}
            className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-brand-cream/60">
                  {s.clave}
                </span>
                {s.tipo === "almacen" && (
                  <span className="rounded-full bg-brand-gold/20 px-3 py-1 text-xs text-brand-gold">
                    Almacén
                  </span>
                )}
                <SucursalRowForm id={s.id} nombre={s.nombre} estado={s.estado} />
              </div>
              <div className="flex items-center gap-4">
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
                {s.tipo !== "almacen" && (
                  <EliminarSucursalForm
                    id={s.id}
                    nombre={s.nombre}
                    vendedores={vendedoresPorSucursal.get(s.id) ?? []}
                    otrasSucursales={sucursales
                      .filter((otra) => otra.id !== s.id && otra.tipo === "sucursal")
                      .map((otra) => ({ id: otra.id, nombre: otra.nombre }))}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
