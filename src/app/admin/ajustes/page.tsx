import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import { formatearFechaHora } from "@/lib/fechas";
import { miles } from "@/lib/formato";
import { esAdmin } from "@/lib/permisos";
import { enteroPositivo } from "@/lib/historial";
import { ETIQUETA_ESTADO, etiquetaMotivoAjuste, type EstadoSolicitud } from "@/lib/ajustes";
import AjusteForm, { type LoteAjuste } from "./ajuste-form";
import ResolverForm from "./resolver-form";
import RetirarForm from "./retirar-form";

interface LoteRow {
  id: number;
  sucursal_id: number;
  lugar: string;
  precio_mxn: string;
  stock: number;
}

interface SolicitudRow {
  id: number;
  creado_en: Date | string;
  revisado_en: Date | string | null;
  estado: EstadoSolicitud;
  direccion: "suma" | "resta";
  piezas: number;
  motivo: string;
  comentario: string;
  existencia_al_solicitar: number;
  comentario_revision: string | null;
  lugar: string;
  precio_mxn: string;
  stock_actual: number;
  solicitado_por: number;
  solicito: string;
  reviso: string | null;
}

const CLASE_ESTADO: Record<EstadoSolicitud, string> = {
  pendiente: "bg-yellow-500/15 text-yellow-500",
  aprobada: "bg-brand-green/15 text-brand-green",
  rechazada: "bg-brand-red/15 text-brand-red",
  cancelada: "bg-white/10 text-brand-cream/70",
};

const consultaSolicitudes = `
  SELECT sa.id, sa.creado_en, sa.revisado_en, sa.estado, sa.direccion, sa.piezas, sa.motivo, sa.comentario,
         sa.existencia_al_solicitar, sa.comentario_revision, sa.solicitado_por,
         s.nombre AS lugar, l.precio_mxn,
         COALESCE((SELECT SUM(cantidad) FROM movimientos_inventario WHERE lote_id = sa.lote_id), 0)::int AS stock_actual,
         u.nombre AS solicito, r.nombre AS reviso
  FROM solicitudes_ajuste sa
  JOIN lotes l ON l.id = sa.lote_id
  JOIN sucursales s ON s.id = sa.sucursal_id
  JOIN usuarios u ON u.id = sa.solicitado_por
  LEFT JOIN usuarios r ON r.id = sa.revisado_por`;

async function cargarDatos() {
  const [{ rows: lotesRows }, { rows: pendientes }, { rows: bitacora }] = await Promise.all([
    query<LoteRow>(
      `SELECT l.id, l.sucursal_id, s.nombre AS lugar, l.precio_mxn,
              COALESCE(SUM(m.cantidad), 0)::int AS stock
       FROM lotes l
       JOIN sucursales s ON s.id = l.sucursal_id
       LEFT JOIN movimientos_inventario m ON m.lote_id = l.id
       GROUP BY l.id, l.sucursal_id, s.nombre, s.tipo, l.precio_mxn
       ORDER BY (s.tipo = 'almacen') DESC, s.nombre, l.precio_mxn`
    ),
    query<SolicitudRow>(`${consultaSolicitudes} WHERE sa.estado = 'pendiente' ORDER BY sa.creado_en`),
    query<SolicitudRow>(
      `${consultaSolicitudes} WHERE sa.estado <> 'pendiente' ORDER BY COALESCE(sa.revisado_en, sa.creado_en) DESC LIMIT 60`
    ),
  ]);
  return { lotesRows, pendientes, bitacora };
}

export default async function AdminAjustesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") redirect("/login");
  const admin = esAdmin(session.user.rol);
  const yoId = Number(session.user.id);

  const sp = await searchParams;
  const loteInicial = enteroPositivo(typeof sp.lote === "string" ? sp.lote : "");

  let datos: Awaited<ReturnType<typeof cargarDatos>>;
  try {
    datos = await cargarDatos();
  } catch (err) {
    // 42P01 = la tabla no existe: falta correr sql/012_solicitudes_ajuste.sql en esta base.
    if ((err as { code?: string }).code !== "42P01") throw err;
    return (
      <div className="flex min-h-screen flex-col">
        <Header titulo="Ajustes de inventario" subtitulo="Correcciones con motivo, comentario y autorización" />
        <AdminNav />
        <main className="p-4 sm:p-6">
          <p className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-brand-cream">
            Falta preparar la base de datos para esta pantalla (la migración{" "}
            <code>012_solicitudes_ajuste.sql</code>). Avisa a soporte; el resto del sistema no se ve afectado.
          </p>
        </main>
      </div>
    );
  }
  const { lotesRows, pendientes, bitacora } = datos;

  const lotes: LoteAjuste[] = lotesRows.map((l) => ({
    id: l.id,
    sucursalId: l.sucursal_id,
    lugar: l.lugar,
    precio: Number(l.precio_mxn),
    stock: l.stock,
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Ajustes de inventario" subtitulo="Correcciones con motivo, comentario y autorización" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-brand-cream">
            {admin ? "Hacer un ajuste" : "Pedir un ajuste"}
          </h2>
          <p className="text-sm text-brand-cream/70">
            {admin
              ? "Corrige las piezas de un lugar y precio. Queda a tu nombre, con el motivo y el comentario."
              : "Cuando algo no cuadra (error de dedo, de captura, de conteo…), pide el ajuste aquí. Explica qué pasó; la administración lo revisa y lo autoriza."}
          </p>
          <AjusteForm
            key={loteInicial}
            lotes={lotes}
            esAdmin={admin}
            tokenInicial={randomUUID()}
            loteInicial={loteInicial || undefined}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-brand-cream">
            {admin ? "Por autorizar" : "Solicitudes pendientes"}{" "}
            <span className="ml-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs text-yellow-500">
              {pendientes.length}
            </span>
          </h2>
          {pendientes.length === 0 && (
            <p className="rounded-2xl border border-white/10 p-4 text-sm text-brand-cream/70">
              No hay ajustes esperando autorización.
            </p>
          )}
          {pendientes.map((s) => (
            <article key={s.id} className="rounded-2xl border border-yellow-500/30 bg-brand-gray2 p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-semibold text-brand-cream">
                  {s.lugar} · ${Number(s.precio_mxn).toLocaleString("es-MX")}
                </p>
                <p className={`text-lg font-semibold ${s.direccion === "resta" ? "text-brand-red" : "text-brand-green"}`}>
                  {s.direccion === "resta" ? "−" : "+"}
                  {miles(s.piezas)} piezas
                </p>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-brand-cream/80">
                  {etiquetaMotivoAjuste(s.motivo)}
                </span>
                <span className="ml-auto text-xs text-brand-cream/70">{formatearFechaHora(s.creado_en)}</span>
              </div>
              <p className="mt-2 text-sm text-brand-cream/90">“{s.comentario}”</p>
              <p className="mt-1 text-xs text-brand-cream/70">
                Lo pidió {s.solicito}. Al pedirlo había {miles(s.existencia_al_solicitar)} piezas
                {s.stock_actual !== s.existencia_al_solicitar && (
                  <strong className="text-yellow-500"> · ahora hay {miles(s.stock_actual)}</strong>
                )}
                .
              </p>
              {admin ? (
                <ResolverForm id={s.id} />
              ) : (
                s.solicitado_por === yoId && <RetirarForm id={s.id} />
              )}
            </article>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-brand-cream">Bitácora de ajustes</h2>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-gray2 text-brand-cream/70">
                <tr>
                  <th scope="col" className="px-4 py-2">Fecha</th>
                  <th scope="col" className="px-4 py-2">Lugar y precio</th>
                  <th scope="col" className="px-4 py-2 text-right">Piezas</th>
                  <th scope="col" className="px-4 py-2">Qué pasó</th>
                  <th scope="col" className="px-4 py-2">Solicitó</th>
                  <th scope="col" className="px-4 py-2">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {bitacora.map((s) => (
                  <tr key={s.id} className="border-t border-white/10 align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-brand-cream/70">
                      {formatearFechaHora(s.revisado_en ?? s.creado_en)}
                    </td>
                    <td className="px-4 py-2">
                      {s.lugar} · ${Number(s.precio_mxn).toLocaleString("es-MX")}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-semibold ${s.direccion === "resta" ? "text-brand-red" : "text-brand-green"}`}
                    >
                      {s.direccion === "resta" ? "−" : "+"}
                      {miles(s.piezas)}
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-brand-cream/80">{etiquetaMotivoAjuste(s.motivo)}</span>
                      <p className="text-xs text-brand-cream/70">{s.comentario}</p>
                    </td>
                    <td className="px-4 py-2">{s.solicito}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${CLASE_ESTADO[s.estado]}`}>
                        {ETIQUETA_ESTADO[s.estado]}
                      </span>
                      {s.reviso && s.estado !== "cancelada" && (
                        <p className="text-xs text-brand-cream/70">
                          {s.reviso === s.solicito ? "Lo hizo directo" : `por ${s.reviso}`}
                        </p>
                      )}
                      {s.comentario_revision && (
                        <p className="text-xs text-brand-cream/70">“{s.comentario_revision}”</p>
                      )}
                    </td>
                  </tr>
                ))}
                {bitacora.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-brand-cream/70">
                      Todavía no hay ajustes registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-brand-cream/70">
            Se muestran los últimos 60. Cada ajuste autorizado también aparece en el Historial, en Movimientos de
            inventario.
          </p>
        </section>
      </main>
    </div>
  );
}
