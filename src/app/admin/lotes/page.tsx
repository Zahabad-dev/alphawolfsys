import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import NuevoLoteForm from "./nuevo-lote-form";
import { toggleLoteActivoAction } from "./actions";

interface LoteRow {
  id: number;
  nombre: string;
  precio_mxn: string;
  activo: boolean;
  sucursal_nombre: string;
}

interface SucursalRow {
  id: number;
  nombre: string;
}

export default async function AdminLotesPage() {
  const session = await auth();
  if (!session || session.user.rol !== "admin") redirect("/login");

  const [{ rows: lotes }, { rows: sucursales }] = await Promise.all([
    query<LoteRow>(
      `SELECT l.id, l.nombre, l.precio_mxn, l.activo, s.nombre AS sucursal_nombre
       FROM lotes l JOIN sucursales s ON s.id = l.sucursal_id
       ORDER BY s.nombre, l.precio_mxn`
    ),
    query<SucursalRow>("SELECT id, nombre FROM sucursales ORDER BY nombre"),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Lotes y precios" subtitulo="Administración" />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <NuevoLoteForm sucursales={sucursales} />

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-gray2 text-brand-cream/70">
              <tr>
                <th className="px-4 py-2">Sucursal</th>
                <th className="px-4 py-2">Lote</th>
                <th className="px-4 py-2">Precio</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">QR</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => (
                <tr key={l.id} className="border-t border-white/10">
                  <td className="px-4 py-2">{l.sucursal_nombre}</td>
                  <td className="px-4 py-2">{l.nombre}</td>
                  <td className="px-4 py-2">${Number(l.precio_mxn).toFixed(2)}</td>
                  <td className="px-4 py-2">
                    {l.activo ? (
                      <span className="text-brand-green">Activo</span>
                    ) : (
                      <span className="text-brand-cream/50">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/lotes/${l.id}/qr`}
                      className="text-brand-gold underline"
                    >
                      Ver / imprimir
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <form action={toggleLoteActivoAction}>
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="activo" value={String(l.activo)} />
                      <button
                        type="submit"
                        className="text-sm text-brand-cream/70 underline hover:text-brand-gold"
                      >
                        {l.activo ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {lotes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-brand-cream/50">
                    Sin lotes todavía.
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
