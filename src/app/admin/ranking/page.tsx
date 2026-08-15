import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";

interface RankingRow {
  vendedor_nombre: string;
  sucursal_nombre: string;
  piezas: number;
  total: string;
}

function primerDiaDelMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default async function AdminRankingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") redirect("/login");

  const sp = await searchParams;
  const desde = typeof sp.desde === "string" && sp.desde ? sp.desde : primerDiaDelMes();
  const hasta = typeof sp.hasta === "string" && sp.hasta ? sp.hasta : hoyISO();

  const { rows: ranking } = await query<RankingRow>(
    `SELECT u.nombre AS vendedor_nombre, s.nombre AS sucursal_nombre,
            SUM(-m.cantidad)::int AS piezas,
            SUM(-m.cantidad * m.precio_unitario_mxn) AS total
     FROM movimientos_inventario m
     JOIN usuarios u ON u.id = m.usuario_id
     JOIN sucursales s ON s.id = m.sucursal_id
     WHERE m.tipo = 'venta' AND m.creado_en >= $1::date AND m.creado_en < ($2::date + interval '1 day')
     GROUP BY u.id, u.nombre, s.nombre
     ORDER BY total DESC`,
    [desde, hasta]
  );

  const maxPiezas = Math.max(1, ...ranking.map((r) => r.piezas));

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Ranking de vendedores" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <form
          method="get"
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4"
        >
          <label className="flex flex-col gap-1 text-xs text-brand-cream/60">
            Desde
            <input
              name="desde"
              type="date"
              defaultValue={desde}
              className="rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-brand-cream/60">
            Hasta
            <input
              name="hasta"
              type="date"
              defaultValue={hasta}
              className="rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream"
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-brand-gold px-4 py-1.5 text-sm font-semibold text-brand-black"
          >
            Filtrar
          </button>
        </form>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4">
          {ranking.length === 0 && (
            <p className="text-sm text-brand-cream/50">Sin ventas en este rango.</p>
          )}
          {ranking.map((r, i) => (
            <div key={i}>
              <div className="mb-1 flex justify-between text-sm">
                <span>
                  #{i + 1} {r.vendedor_nombre} — {r.sucursal_nombre}
                </span>
                <span className="text-brand-gold">
                  {r.piezas} pzs — ${Number(r.total).toFixed(2)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-brand-black">
                <div
                  className="h-full rounded-full bg-brand-gold"
                  style={{ width: `${(r.piezas / maxPiezas) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
