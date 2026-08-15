import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import NotificacionesToggle from "./notificaciones-toggle";

interface ResumenRow {
  piezas_hoy: number;
  total_hoy: string;
  piezas_semana: number;
  total_semana: string;
  piezas_mes: number;
  total_mes: string;
  piezas_cortadas_mes: number;
  piezas_traspasadas_mes: number;
}

interface PorSucursalRow {
  sucursal_nombre: string;
  piezas: number;
  total: string;
}

interface TopLoteRow {
  lote_nombre: string;
  sucursal_nombre: string;
  piezas: number;
}

interface StockBajoRow {
  lote_id: number;
  nombre: string;
  stock: number;
  sucursal_nombre: string;
}

function money(v: string | number) {
  return `$${Number(v).toFixed(2)}`;
}

export default async function AdminDashboardPage() {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") redirect("/login");

  const [{ rows: resumenRows }, { rows: porSucursal }, { rows: topLotes }, { rows: stockBajo }] =
    await Promise.all([
      query<ResumenRow>(
        `SELECT
           COALESCE(SUM(CASE WHEN creado_en >= CURRENT_DATE THEN -cantidad ELSE 0 END),0)::int AS piezas_hoy,
           COALESCE(SUM(CASE WHEN creado_en >= CURRENT_DATE THEN -cantidad*precio_unitario_mxn ELSE 0 END),0) AS total_hoy,
           COALESCE(SUM(CASE WHEN creado_en >= date_trunc('week', now()) THEN -cantidad ELSE 0 END),0)::int AS piezas_semana,
           COALESCE(SUM(CASE WHEN creado_en >= date_trunc('week', now()) THEN -cantidad*precio_unitario_mxn ELSE 0 END),0) AS total_semana,
           COALESCE(SUM(CASE WHEN creado_en >= date_trunc('month', now()) THEN -cantidad ELSE 0 END),0)::int AS piezas_mes,
           COALESCE(SUM(CASE WHEN creado_en >= date_trunc('month', now()) THEN -cantidad*precio_unitario_mxn ELSE 0 END),0) AS total_mes,
           (SELECT COALESCE(SUM(cantidad),0)::int FROM movimientos_inventario
             WHERE tipo = 'corte' AND creado_en >= date_trunc('month', now())) AS piezas_cortadas_mes,
           (SELECT COALESCE(SUM(cantidad),0)::int FROM movimientos_inventario
             WHERE tipo = 'traspaso_entrada' AND creado_en >= date_trunc('month', now())) AS piezas_traspasadas_mes
         FROM movimientos_inventario
         WHERE tipo = 'venta'`
      ),
      query<PorSucursalRow>(
        `SELECT s.nombre AS sucursal_nombre,
                COALESCE(SUM(-m.cantidad),0)::int AS piezas,
                COALESCE(SUM(-m.cantidad*m.precio_unitario_mxn),0) AS total
         FROM sucursales s
         LEFT JOIN movimientos_inventario m
           ON m.sucursal_id = s.id AND m.tipo = 'venta' AND m.creado_en >= date_trunc('month', now())
         WHERE s.tipo = 'sucursal'
         GROUP BY s.id, s.nombre
         ORDER BY s.nombre`
      ),
      query<TopLoteRow>(
        `SELECT l.nombre AS lote_nombre, s.nombre AS sucursal_nombre, SUM(-m.cantidad)::int AS piezas
         FROM movimientos_inventario m
         JOIN lotes l ON l.id = m.lote_id
         JOIN sucursales s ON s.id = m.sucursal_id
         WHERE m.tipo = 'venta' AND m.creado_en >= date_trunc('month', now())
         GROUP BY l.id, l.nombre, s.nombre
         ORDER BY piezas DESC
         LIMIT 5`
      ),
      query<StockBajoRow>(
        `SELECT sa.lote_id, sa.nombre, sa.stock, s.nombre AS sucursal_nombre
         FROM stock_actual sa
         JOIN lotes l ON l.id = sa.lote_id
         JOIN sucursales s ON s.id = sa.sucursal_id
         WHERE sa.stock <= l.umbral_stock
         ORDER BY sa.stock ASC`
      ),
    ]);

  const resumen = resumenRows[0];
  const maxPiezasSucursal = Math.max(1, ...porSucursal.map((s) => s.piezas));
  const maxPiezasLote = Math.max(1, ...topLotes.map((l) => l.piezas));

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Dashboard" subtitulo="Todas las sucursales" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-8 p-4 sm:p-6">
        <NotificacionesToggle />

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard titulo="Hoy" piezas={resumen.piezas_hoy} total={resumen.total_hoy} />
          <StatCard titulo="Esta semana" piezas={resumen.piezas_semana} total={resumen.total_semana} />
          <StatCard titulo="Este mes" piezas={resumen.piezas_mes} total={resumen.total_mes} />
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-brand-gray2 p-4">
            <p className="text-sm text-brand-cream/70">Piezas cortadas (este mes)</p>
            <p className="text-2xl font-bold text-brand-gold">{resumen.piezas_cortadas_mes} pzs</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-brand-gray2 p-4">
            <p className="text-sm text-brand-cream/70">Piezas traspasadas a sucursales (este mes)</p>
            <p className="text-2xl font-bold text-brand-gold">{resumen.piezas_traspasadas_mes} pzs</p>
          </div>
        </section>

        {stockBajo.length > 0 && (
          <section className="rounded-2xl border border-brand-red/40 bg-brand-red/10 p-4">
            <p className="mb-2 font-semibold text-brand-red">
              ⚠ {stockBajo.length} lote{stockBajo.length > 1 ? "s" : ""} con stock bajo (bajo su mínimo configurado)
            </p>
            <ul className="flex flex-col gap-1 text-sm text-brand-cream/80">
              {stockBajo.map((s) => (
                <li key={s.lote_id}>
                  {s.sucursal_nombre} — {s.nombre}: <strong>{s.stock}</strong> piezas
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <p className="mb-3 text-sm text-brand-cream/70">Ventas por sucursal (este mes)</p>
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4">
            {porSucursal.map((s) => (
              <div key={s.sucursal_nombre}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{s.sucursal_nombre}</span>
                  <span className="text-brand-gold">
                    {s.piezas} pzs — {money(s.total)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-brand-black">
                  <div
                    className="h-full rounded-full bg-brand-gold"
                    style={{ width: `${(s.piezas / maxPiezasSucursal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-3 text-sm text-brand-cream/70">Top 5 precios vendidos (este mes)</p>
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4">
            {topLotes.length === 0 && (
              <p className="text-sm text-brand-cream/50">Sin ventas este mes todavía.</p>
            )}
            {topLotes.map((l, i) => (
              <div key={i}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>
                    {l.sucursal_nombre} — {l.lote_nombre}
                  </span>
                  <span className="text-brand-gold">{l.piezas} pzs</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-brand-black">
                  <div
                    className="h-full rounded-full bg-brand-gold"
                    style={{ width: `${(l.piezas / maxPiezasLote) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  titulo,
  piezas,
  total,
}: {
  titulo: string;
  piezas: number;
  total: string | number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-brand-gray2 p-4">
      <p className="text-sm text-brand-cream/70">{titulo}</p>
      <p className="text-2xl font-bold text-brand-gold">{piezas} pzs</p>
      <p className="text-brand-cream/80">{money(total)}</p>
    </div>
  );
}
