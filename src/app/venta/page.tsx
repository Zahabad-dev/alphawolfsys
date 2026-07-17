import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";

interface SucursalRow {
  nombre: string;
  estado: string;
}

interface VentaHoyRow {
  lote_nombre: string;
  cantidad: number;
  total: string;
  hora: string;
}

export default async function VentaPage() {
  const session = await auth();
  const user = session!.user;

  if (user.rol === "admin") {
    redirect("/admin/dashboard");
  }

  const { rows: sucursalRows } = await query<SucursalRow>(
    "SELECT nombre, estado FROM sucursales WHERE id = $1",
    [user.sucursalId]
  );
  const sucursal = sucursalRows[0];

  const { rows: ventasHoy } = await query<VentaHoyRow>(
    `SELECT l.nombre AS lote_nombre, -m.cantidad AS cantidad,
            (-m.cantidad * m.precio_unitario_mxn) AS total,
            to_char(m.creado_en, 'HH24:MI') AS hora
     FROM movimientos_inventario m
     JOIN lotes l ON l.id = m.lote_id
     WHERE m.tipo = 'venta' AND m.sucursal_id = $1 AND m.creado_en >= CURRENT_DATE
     ORDER BY m.creado_en DESC
     LIMIT 20`,
    [user.sucursalId]
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        titulo={`Hola, ${user.name}`}
        subtitulo={sucursal ? `${sucursal.nombre} — ${sucursal.estado}` : "Sucursal desconocida"}
      />
      <main className="flex flex-1 flex-col items-center gap-6 p-6">
        <Link
          href="/venta/escanear"
          className="w-full max-w-sm rounded-2xl bg-brand-gold py-6 text-center text-2xl font-bold text-brand-black"
        >
          Escanear lote
        </Link>

        <Link
          href="/inventario"
          className="w-full max-w-sm rounded-full border border-white/10 py-2 text-center text-sm text-brand-cream/80"
        >
          Ver inventario de mi sucursal
        </Link>

        <div className="w-full max-w-sm">
          <p className="mb-2 text-sm text-brand-cream/70">Ventas de hoy</p>
          <div className="flex flex-col gap-2">
            {ventasHoy.map((v, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-brand-gray2 px-3 py-2 text-sm"
              >
                <span>
                  {v.hora} — {v.lote_nombre} × {v.cantidad}
                </span>
                <span className="text-brand-gold">${Number(v.total).toFixed(2)}</span>
              </div>
            ))}
            {ventasHoy.length === 0 && (
              <p className="text-center text-sm text-brand-cream/50">Sin ventas todavía hoy.</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
