import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import { formatearFechaHora } from "@/lib/fechas";
import { dinero } from "@/lib/formato";
import { enteroPositivo } from "@/lib/historial";
import { puedeGestionar } from "@/lib/permisos";
import { PrecioForm, QuitarPrecioForm, type SucursalPrecio } from "./precio-form";

interface SucursalRow {
  id: number;
  nombre: string;
  clave: string;
  tipo: string;
  activa: boolean;
  vigente: string | null;
  vigente_desde: Date | string | null;
  precios_sucursal: string[];
}

interface HistorialRow {
  id: number;
  sucursal: string;
  precio_mxn: string;
  vigente_desde: Date | string;
  vigente_hasta: Date | string | null;
  puesto_por: string | null;
  quitado_por: string | null;
  nota: string | null;
}

const HISTORIAL_MAX = 200;

export default async function PreciosModeloPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") redirect("/login");
  const gestiona = puedeGestionar(session.user.rol);
  const id = enteroPositivo((await params).id);
  if (!id) notFound();

  const { rows: modelo } = await query<{ id: number; nombre: string; activo: boolean }>(
    "SELECT id, nombre, activo FROM modelos WHERE id = $1",
    [id]
  );
  if (!modelo[0]) notFound();

  const [{ rows: sucursales }, { rows: historial }] = await Promise.all([
    query<SucursalRow>(
      `SELECT s.id, s.nombre, s.clave, s.tipo, s.activa, pm.precio_mxn AS vigente, pm.vigente_desde,
              COALESCE((SELECT array_agg(DISTINCT l.precio_mxn::text) FROM lotes l
                         WHERE l.sucursal_id = s.id AND l.activo), '{}') AS precios_sucursal
         FROM sucursales s
         LEFT JOIN precios_modelo pm ON pm.sucursal_id = s.id AND pm.modelo_id = $1 AND pm.vigente_hasta IS NULL
        WHERE s.activa OR pm.id IS NOT NULL
        ORDER BY s.tipo = 'almacen' DESC, s.nombre`,
      [id]
    ),
    query<HistorialRow>(
      `SELECT pm.id, s.nombre AS sucursal, pm.precio_mxn, pm.vigente_desde, pm.vigente_hasta, pm.nota,
              up.nombre AS puesto_por, uq.nombre AS quitado_por
         FROM precios_modelo pm
         JOIN sucursales s ON s.id = pm.sucursal_id
         LEFT JOIN usuarios up ON up.id = pm.puesto_por
         LEFT JOIN usuarios uq ON uq.id = pm.quitado_por
        WHERE pm.modelo_id = $1
        ORDER BY GREATEST(pm.vigente_desde, COALESCE(pm.vigente_hasta, pm.vigente_desde)) DESC, pm.id DESC
        LIMIT ${HISTORIAL_MAX}`,
      [id]
    ),
  ]);

  // Solo las sucursales activas se pueden elegir para poner precio (en la tabla aparecen también las inactivas con precio).
  const opciones: SucursalPrecio[] = sucursales.filter((s) => s.activa).map((s) => ({
    id: s.id,
    nombre: s.nombre,
    clave: s.clave,
    esAlmacen: s.tipo === "almacen",
    vigente: s.vigente === null ? null : Number(s.vigente),
    preciosSucursal: s.precios_sucursal.map(Number),
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Precios del modelo" subtitulo={modelo[0].nombre} />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/admin/modelos" className="text-brand-cream/70 underline hover:text-brand-gold">
            ← Volver a Modelos
          </Link>
          <Link href={`/admin/modelos/${id}/etiqueta`} className="text-brand-cream/70 underline hover:text-brand-gold">
            Ver etiqueta
          </Link>
          {!modelo[0].activo && <span className="text-brand-cream/70">Este modelo está descontinuado.</span>}
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-brand-cream">Precio en cada sucursal</h2>
          <p className="text-sm text-brand-cream/70">
            El mismo modelo puede costar distinto en cada sucursal. Al cambiar un precio, el anterior queda en el historial.
            Las ventas que ya se hicieron conservan su precio.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-gray2 text-brand-cream/70">
                <tr>
                  <th scope="col" className="px-4 py-2">Sucursal</th>
                  <th scope="col" className="px-4 py-2">Precio</th>
                  <th scope="col" className="px-4 py-2">Desde</th>
                  {gestiona && (
                    <th scope="col" className="px-4 py-2">
                      <span className="sr-only">Acciones</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sucursales.map((s) => (
                  <tr key={s.id} className="border-t border-white/10">
                    <td className="px-4 py-2 text-brand-cream">{s.nombre}</td>
                    <td className="px-4 py-2 font-semibold text-brand-cream">
                      {s.vigente === null ? <span className="font-normal text-brand-cream/70">sin precio</span> : dinero(Number(s.vigente))}
                    </td>
                    <td className="px-4 py-2 text-brand-cream/70">{s.vigente_desde ? formatearFechaHora(s.vigente_desde) : "—"}</td>
                    {gestiona && (
                      <td className="px-4 py-2">
                        {s.vigente !== null && <QuitarPrecioForm modeloId={id} sucursalId={s.id} sucursal={s.nombre} />}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {gestiona ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-brand-cream">Poner o cambiar precio</h2>
            <PrecioForm modeloId={id} sucursales={opciones} />
          </section>
        ) : (
          <p className="rounded-2xl border border-white/10 p-4 text-sm text-brand-cream/70">
            Aquí puedes consultar los precios. Cambiarlos lo hace la administración o la gerencia.
          </p>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-brand-cream">Historial de precios</h2>
          {historial.length === 0 ? (
            <p className="text-sm text-brand-cream/70">Todavía no se le ha puesto precio a este modelo.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-brand-gray2 text-brand-cream/70">
                  <tr>
                    <th scope="col" className="px-4 py-2">Sucursal</th>
                    <th scope="col" className="px-4 py-2">Precio</th>
                    <th scope="col" className="px-4 py-2">Vigente</th>
                    <th scope="col" className="px-4 py-2">Quién</th>
                    <th scope="col" className="px-4 py-2">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((h) => (
                    <tr key={h.id} className="border-t border-white/10 align-top">
                      <td className="px-4 py-2 text-brand-cream">{h.sucursal}</td>
                      <td className="px-4 py-2 font-semibold text-brand-cream">{dinero(Number(h.precio_mxn))}</td>
                      <td className="px-4 py-2 text-brand-cream/80">
                        {formatearFechaHora(h.vigente_desde)} →{" "}
                        {h.vigente_hasta ? formatearFechaHora(h.vigente_hasta) : <span className="text-brand-green">vigente</span>}
                      </td>
                      <td className="px-4 py-2 text-brand-cream/80">
                        Puso: {h.puesto_por ?? "—"}
                        {h.vigente_hasta && <span className="block text-xs text-brand-cream/70">Cambió/quitó: {h.quitado_por ?? "—"}</span>}
                      </td>
                      <td className="px-4 py-2 text-brand-cream/80">{h.nota ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
