import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import NuevoPrecioForm from "./nuevo-precio-form";
import { togglePrecioActivoAction } from "./actions";

interface PrecioRow {
  id: number;
  precio_mxn: string;
  activo: boolean;
  sucursal_nombre: string;
}

interface SucursalRow {
  id: number;
  nombre: string;
}

export default async function AdminPreciosPage() {
  const session = await auth();
  if (!session || session.user.rol !== "admin") redirect("/login");

  const [{ rows: precios }, { rows: sucursales }] = await Promise.all([
    query<PrecioRow>(
      `SELECT l.id, l.precio_mxn, l.activo, s.nombre AS sucursal_nombre
       FROM lotes l JOIN sucursales s ON s.id = l.sucursal_id
       ORDER BY s.nombre, l.precio_mxn`
    ),
    query<SucursalRow>("SELECT id, nombre FROM sucursales WHERE activa = true ORDER BY nombre"),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Precios" subtitulo="Un QR por precio y sucursal" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <NuevoPrecioForm sucursales={sucursales} />

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-gray2 text-brand-cream/70">
              <tr>
                <th className="px-4 py-2">Sucursal</th>
                <th className="px-4 py-2">Precio</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">QR</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {precios.map((p) => (
                <tr key={p.id} className="border-t border-white/10">
                  <td className="px-4 py-2">{p.sucursal_nombre}</td>
                  <td className="px-4 py-2">${Number(p.precio_mxn).toFixed(2)}</td>
                  <td className="px-4 py-2">
                    {p.activo ? (
                      <span className="text-brand-green">Activo</span>
                    ) : (
                      <span className="text-brand-cream/50">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/admin/precios/${p.id}/qr`} className="text-brand-gold underline">
                      Ver / imprimir
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <form action={togglePrecioActivoAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="activo" value={String(p.activo)} />
                      <button
                        type="submit"
                        className="text-sm text-brand-cream/70 underline hover:text-brand-gold"
                      >
                        {p.activo ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {precios.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-brand-cream/50">
                    Sin precios todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
