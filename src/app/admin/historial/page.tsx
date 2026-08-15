import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";

interface SucursalRow {
  id: number;
  nombre: string;
}

interface MovimientoRow {
  id: number;
  creado_en: string;
  sucursal_nombre: string;
  lote_nombre: string;
  tipo: string;
  cantidad: number;
  precio_unitario_mxn: string | null;
  usuario_nombre: string;
  nota: string | null;
}

const TIPOS = [
  "entrada",
  "venta",
  "ajuste",
  "corte",
  "traspaso_salida",
  "traspaso_entrada",
] as const;

export default async function AdminHistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session || session.user.rol !== "admin") redirect("/login");

  const sp = await searchParams;
  const sucursalId = typeof sp.sucursal_id === "string" ? sp.sucursal_id : "";
  const tipo = typeof sp.tipo === "string" ? sp.tipo : "";
  const desde = typeof sp.desde === "string" ? sp.desde : "";
  const hasta = typeof sp.hasta === "string" ? sp.hasta : "";

  const condiciones: string[] = [];
  const params: unknown[] = [];

  if (sucursalId) {
    params.push(Number(sucursalId));
    condiciones.push(`m.sucursal_id = $${params.length}`);
  }
  if (tipo && (TIPOS as readonly string[]).includes(tipo)) {
    params.push(tipo);
    condiciones.push(`m.tipo = $${params.length}`);
  }
  if (desde) {
    params.push(desde);
    condiciones.push(`m.creado_en >= $${params.length}::date`);
  }
  if (hasta) {
    params.push(hasta);
    condiciones.push(`m.creado_en < ($${params.length}::date + interval '1 day')`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  const [{ rows: sucursales }, { rows: movimientos }] = await Promise.all([
    query<SucursalRow>("SELECT id, nombre FROM sucursales ORDER BY nombre"),
    query<MovimientoRow>(
      `SELECT m.id, m.creado_en, s.nombre AS sucursal_nombre, l.nombre AS lote_nombre,
              m.tipo, m.cantidad, m.precio_unitario_mxn, u.nombre AS usuario_nombre, m.nota
       FROM movimientos_inventario m
       JOIN sucursales s ON s.id = m.sucursal_id
       JOIN lotes l ON l.id = m.lote_id
       JOIN usuarios u ON u.id = m.usuario_id
       ${where}
       ORDER BY m.creado_en DESC
       LIMIT 200`,
      params
    ),
  ]);

  const queryString = new URLSearchParams(
    Object.entries({ sucursal_id: sucursalId, tipo, desde, hasta }).filter(([, v]) => v)
  ).toString();

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Historial" subtitulo="Últimos 200 movimientos" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <form
          method="get"
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4"
        >
          <label className="flex flex-col gap-1 text-xs text-brand-cream/60">
            Sucursal
            <select
              name="sucursal_id"
              defaultValue={sucursalId}
              className="rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream"
            >
              <option value="">Todas</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-brand-cream/60">
            Tipo
            <select
              name="tipo"
              defaultValue={tipo}
              className="rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream"
            >
              <option value="">Todos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
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
          <a
            href={`/admin/export/movimientos${queryString ? `?${queryString}` : ""}`}
            className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-brand-cream/80 hover:border-brand-gold hover:text-brand-gold"
          >
            Exportar CSV
          </a>
        </form>

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-gray2 text-brand-cream/70">
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Sucursal</th>
                <th className="px-4 py-2">Lote</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Cantidad</th>
                <th className="px-4 py-2">Usuario</th>
                <th className="px-4 py-2">Nota</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id} className="border-t border-white/10">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {new Date(m.creado_en).toLocaleString("es-MX")}
                  </td>
                  <td className="px-4 py-2">{m.sucursal_nombre}</td>
                  <td className="px-4 py-2">{m.lote_nombre}</td>
                  <td className="px-4 py-2 capitalize">{m.tipo}</td>
                  <td
                    className={`px-4 py-2 ${m.cantidad < 0 ? "text-brand-red" : "text-brand-green"}`}
                  >
                    {m.cantidad > 0 ? "+" : ""}
                    {m.cantidad}
                  </td>
                  <td className="px-4 py-2">{m.usuario_nombre}</td>
                  <td className="px-4 py-2 text-brand-cream/60">{m.nota ?? ""}</td>
                </tr>
              ))}
              {movimientos.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-brand-cream/50">
                    Sin movimientos para este filtro.
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
