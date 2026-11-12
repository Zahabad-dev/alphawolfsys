import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { esAdmin, puedeGestionar } from "@/lib/permisos";
import { formatearFechaHora, hoyISO, primerDiaDelMes } from "@/lib/fechas";
import { miles } from "@/lib/formato";
import { sumarDias } from "@/lib/historial";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import NuevoVendedorForm from "./nuevo-vendedor-form";
import SucursalSelect from "./sucursal-select";
import EliminarVendedorForm from "./eliminar-vendedor-form";
import CambiarPasswordForm from "./cambiar-password-form";
import { toggleUsuarioActivoAction } from "./actions";
import type { Rol } from "@/types/next-auth";

interface UsuarioRow {
  id: number;
  username: string;
  nombre: string;
  rol: Rol;
  sucursal_id: number | null;
  sucursal_nombre: string | null;
  activo: boolean;
}

interface SucursalRow {
  id: number;
  nombre: string;
}

/** Ventas de un vendedor: piezas y número de ventas hoy, en 7 días y en el mes. Nunca dinero. */
interface EstadisticaVendedor {
  id: number;
  nombre: string;
  sucursal_nombre: string | null;
  activo: boolean;
  piezas_hoy: number;
  ventas_hoy: number;
  piezas_semana: number;
  ventas_semana: number;
  piezas_mes: number;
  ventas_mes: number;
  ultima_venta: Date | string | null;
}

export default async function AdminUsuariosPage() {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") redirect("/login");
  // Admin y gerente gestionan; eliminar vendedores/sucursales es solo del administrador.
  const gestiona = puedeGestionar(session.user.rol);
  const soloAdmin = esAdmin(session.user.rol);

  // Ventana de las estadísticas: hoy, los últimos 7 días y el mes en curso (hora de México).
  const hoy = hoyISO();
  const inicioMes = primerDiaDelMes();
  const inicioSemana = sumarDias(hoy, -6);
  const [{ rows: usuarios }, { rows: sucursales }, { rows: estadisticas }] = await Promise.all([
    query<UsuarioRow>(
      `SELECT u.id, u.username, u.nombre, u.rol, u.sucursal_id, s.nombre AS sucursal_nombre, u.activo
       FROM usuarios u
       LEFT JOIN sucursales s ON s.id = u.sucursal_id
       ORDER BY u.rol, s.nombre NULLS FIRST, u.nombre`
    ),
    query<SucursalRow>("SELECT id, nombre FROM sucursales WHERE activa = true ORDER BY nombre"),
    // Una venta = todas las piezas con el mismo venta_id (las antiguas, sin venta_id, cuentan una por pieza).
    query<EstadisticaVendedor>(
      `SELECT u.id, u.nombre, s.nombre AS sucursal_nombre, u.activo,
              COALESCE(SUM(-m.cantidad) FILTER (WHERE m.creado_en >= $1::date), 0)::int AS piezas_hoy,
              COUNT(DISTINCT COALESCE(m.venta_id::text, m.id::text)) FILTER (WHERE m.creado_en >= $1::date)::int AS ventas_hoy,
              COALESCE(SUM(-m.cantidad) FILTER (WHERE m.creado_en >= $2::date), 0)::int AS piezas_semana,
              COUNT(DISTINCT COALESCE(m.venta_id::text, m.id::text)) FILTER (WHERE m.creado_en >= $2::date)::int AS ventas_semana,
              COALESCE(SUM(-m.cantidad) FILTER (WHERE m.creado_en >= $3::date), 0)::int AS piezas_mes,
              COUNT(DISTINCT COALESCE(m.venta_id::text, m.id::text)) FILTER (WHERE m.creado_en >= $3::date)::int AS ventas_mes,
              -- La última venta se busca en todo el historial, no solo en la ventana de arriba: un
              -- vendedor que vendió hace 40 días no debe aparecer como "Sin ventas".
              (SELECT MAX(v.creado_en) FROM movimientos_inventario v
                WHERE v.usuario_id = u.id AND v.tipo = 'venta') AS ultima_venta
       FROM usuarios u
       LEFT JOIN sucursales s ON s.id = u.sucursal_id
       LEFT JOIN movimientos_inventario m
              ON m.usuario_id = u.id AND m.tipo = 'venta' AND m.creado_en >= $4::date
       WHERE u.rol = 'vendedor'
       GROUP BY u.id, u.nombre, s.nombre, u.activo
       ORDER BY piezas_mes DESC, u.nombre`,
      // $4 es el inicio más antiguo de las tres ventanas, para no recorrer todo el historial.
      [hoy, inicioSemana, inicioMes, inicioMes < inicioSemana ? inicioMes : inicioSemana]
    ),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Vendedores" subtitulo="Gestión de usuarios" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        {/* Ventas y estadísticas: las ve la administración y la gerente (solo piezas, nunca dinero) */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-brand-cream">Ventas por vendedor</h2>
            <a
              href={`/admin/historial/ventas?desde=${inicioMes}`}
              className="rounded-full border border-brand-gold/50 px-3 py-1.5 text-sm text-brand-gold hover:bg-brand-gold hover:text-brand-black"
            >
              Ver todas las ventas del mes →
            </a>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-gray2 text-brand-cream/70">
                <tr>
                  <th scope="col" className="px-4 py-2">Vendedor</th>
                  <th scope="col" className="px-4 py-2 text-right">Hoy</th>
                  <th scope="col" className="px-4 py-2 text-right">Últimos 7 días</th>
                  <th scope="col" className="px-4 py-2 text-right">Este mes</th>
                  <th scope="col" className="px-4 py-2 text-right">Piezas por venta (mes)</th>
                  <th scope="col" className="px-4 py-2">Última venta</th>
                  <th scope="col" className="px-4 py-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {estadisticas.map((e) => (
                  <tr key={e.id} className="border-t border-white/10">
                    <td className="px-4 py-2">
                      <span className="font-semibold">{e.nombre}</span>
                      <span className="block text-xs text-brand-cream/70">
                        {e.sucursal_nombre ?? "Sin sucursal"}
                        {e.activo ? "" : " · inactivo"}
                      </span>
                    </td>
                    {(
                      [
                        [e.ventas_hoy, e.piezas_hoy],
                        [e.ventas_semana, e.piezas_semana],
                        [e.ventas_mes, e.piezas_mes],
                      ] as const
                    ).map(([ventas, piezas], i) => (
                      <td key={i} className="px-4 py-2 text-right">
                        <span className="font-semibold text-brand-gold">{miles(piezas)}</span> pzs
                        <span className="block text-xs text-brand-cream/70">
                          {miles(ventas)} {ventas === 1 ? "venta" : "ventas"}
                        </span>
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right">
                      {e.ventas_mes > 0 ? (e.piezas_mes / e.ventas_mes).toLocaleString("es-MX", { maximumFractionDigits: 1 }) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-brand-cream/70">
                      {e.ultima_venta ? formatearFechaHora(e.ultima_venta) : "Sin ventas"}
                    </td>
                    <td className="px-4 py-2">
                      <a
                        href={`/admin/historial/ventas?vendedor=${e.id}&desde=${inicioMes}`}
                        className="text-sm text-brand-cream/70 underline hover:text-brand-gold"
                      >
                        Ver sus ventas
                      </a>
                    </td>
                  </tr>
                ))}
                {estadisticas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-brand-cream/70">
                      Todavía no hay vendedores.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {gestiona && <NuevoVendedorForm sucursales={sucursales} />}

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-gray2 text-brand-cream/70">
              <tr>
                <th className="px-4 py-2">Usuario</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Rol</th>
                <th className="px-4 py-2">Sucursal</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-white/10">
                  <td className="px-4 py-2">{u.username}</td>
                  <td className="px-4 py-2">{u.nombre}</td>
                  <td className="px-4 py-2 capitalize">{u.rol}</td>
                  <td className="px-4 py-2">
                    {u.rol === "vendedor" ? (
                      <SucursalSelect
                        usuarioId={u.id}
                        sucursalIdActual={u.sucursal_id ?? 0}
                        sucursales={sucursales}
                      />
                    ) : (
                      <span className="text-brand-cream/50">Todas</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {u.activo ? (
                      <span className="text-brand-green">Activo</span>
                    ) : (
                      <span className="text-brand-cream/50">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {u.rol === "vendedor" && (
                      <div className="flex flex-col items-start gap-2">
                        <div className="flex items-center gap-3">
                          <form action={toggleUsuarioActivoAction}>
                            <input type="hidden" name="id" value={u.id} />
                            <input type="hidden" name="activo" value={String(u.activo)} />
                            <button
                              type="submit"
                              className="text-sm text-brand-cream/70 underline hover:text-brand-gold"
                            >
                              {u.activo ? "Desactivar" : "Activar"}
                            </button>
                          </form>
                          {gestiona && <CambiarPasswordForm id={u.id} username={u.username} />}
                          {soloAdmin && <EliminarVendedorForm id={u.id} username={u.username} />}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
