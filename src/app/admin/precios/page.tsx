import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import NuevoPrecioForm from "./nuevo-precio-form";
import AsignarPrecioForm from "./asignar-precio-form";
import EditarPrecioForm from "./editar-precio-form";
import EliminarPrecioForm from "./eliminar-precio-form";
import { togglePrecioActivoAction } from "./actions";

interface PrecioRow {
  id: number;
  precio_mxn: string;
  activo: boolean;
  sucursal_id: number;
  sucursal_nombre: string;
  sucursal_clave: string;
  sucursal_tipo: string;
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
      `SELECT l.id, l.precio_mxn, l.activo, s.id AS sucursal_id, s.nombre AS sucursal_nombre,
              s.clave AS sucursal_clave, s.tipo AS sucursal_tipo
       FROM lotes l JOIN sucursales s ON s.id = l.sucursal_id
       ORDER BY s.tipo, s.nombre, l.precio_mxn`
    ),
    query<SucursalRow>(
      "SELECT id, nombre FROM sucursales WHERE activa = true AND tipo = 'sucursal' ORDER BY nombre"
    ),
  ]);

  const grupos = new Map<
    number,
    { nombre: string; clave: string; tipo: string; precios: PrecioRow[] }
  >();
  for (const p of precios) {
    const grupo = grupos.get(p.sucursal_id) ?? {
      nombre: p.sucursal_nombre,
      clave: p.sucursal_clave,
      tipo: p.sucursal_tipo,
      precios: [],
    };
    grupo.precios.push(p);
    grupos.set(p.sucursal_id, grupo);
  }

  const preciosAlmacen = precios
    .filter((p) => p.sucursal_tipo === "almacen" && p.activo)
    .map((p) => Number(p.precio_mxn));

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Precios" subtitulo="El Almacén es el catálogo — de ahí se asignan a cada sucursal" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <NuevoPrecioForm />

        {preciosAlmacen.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-brand-gray2 p-4 text-sm text-brand-cream/70">
            Agrega al menos un precio al Almacén arriba antes de poder asignarlo a una sucursal.
          </p>
        ) : (
          <AsignarPrecioForm preciosAlmacen={preciosAlmacen} sucursales={sucursales} />
        )}

        {grupos.size === 0 && (
          <p className="rounded-2xl border border-white/10 bg-brand-gray2 p-4 text-center text-sm text-brand-cream/50">
            Sin precios todavía.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {[...grupos.values()].map((grupo) => (
            <details
              key={grupo.clave}
              className="group rounded-2xl border border-white/10 bg-brand-gray2 open:pb-2"
            >
              <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 text-brand-cream">
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-brand-cream/60">
                  {grupo.clave}
                </span>
                <span className="font-semibold">{grupo.nombre}</span>
                {grupo.tipo === "almacen" && (
                  <span className="rounded-full bg-brand-gold/20 px-3 py-1 text-xs text-brand-gold">
                    Almacén — catálogo
                  </span>
                )}
                <span className="ml-auto text-sm text-brand-cream/50">
                  {grupo.precios.length} precio{grupo.precios.length !== 1 ? "s" : ""}
                </span>
              </summary>

              <div className="overflow-x-auto border-t border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="text-brand-cream/70">
                    <tr>
                      <th className="px-4 py-2">Precio</th>
                      <th className="px-4 py-2">Estado</th>
                      <th className="px-4 py-2">QR</th>
                      <th className="px-4 py-2"></th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.precios.map((p) => (
                      <tr key={p.id} className="border-t border-white/10">
                        <td className="px-4 py-2">
                          <EditarPrecioForm id={p.id} precioActual={Number(p.precio_mxn)} />
                        </td>
                        <td className="px-4 py-2">
                          {p.activo ? (
                            <span className="text-brand-green">Activo</span>
                          ) : (
                            <span className="text-brand-cream/50">Inactivo</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <Link
                            href={`/admin/precios/${p.id}/qr`}
                            className="text-brand-gold underline"
                          >
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
                        <td className="px-4 py-2">
                          <EliminarPrecioForm id={p.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      </main>
    </div>
  );
}
