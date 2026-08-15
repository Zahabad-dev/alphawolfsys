import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import EntradaForm from "./entrada-form";
import UmbralForm from "./umbral-form";

interface StockRow {
  lote_id: number;
  nombre: string;
  precio_mxn: string;
  stock: number;
  sucursal_nombre: string;
  umbral_stock: number;
}

export default async function AdminInventarioPage() {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") redirect("/login");

  const { rows: stock } = await query<StockRow>(
    `SELECT sa.lote_id, sa.nombre, sa.precio_mxn, sa.stock, s.nombre AS sucursal_nombre, l.umbral_stock
     FROM stock_actual sa
     JOIN sucursales s ON s.id = sa.sucursal_id
     JOIN lotes l ON l.id = sa.lote_id
     ORDER BY s.nombre, sa.precio_mxn`
  );

  const lotesParaForm = stock.map((s) => ({
    id: s.lote_id,
    etiqueta: `${s.sucursal_nombre} — $${Number(s.precio_mxn).toFixed(2)}`,
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Inventario" subtitulo="Todas las sucursales" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <EntradaForm lotes={lotesParaForm} />
        </div>
        <a
          href="/admin/export/inventario"
          className="self-start rounded-full border border-white/10 px-4 py-1.5 text-sm text-brand-cream/80 hover:border-brand-gold hover:text-brand-gold"
        >
          Exportar CSV
        </a>

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-gray2 text-brand-cream/70">
              <tr>
                <th className="px-4 py-2">Sucursal</th>
                <th className="px-4 py-2">Precio</th>
                <th className="px-4 py-2">Stock</th>
                <th className="px-4 py-2">Mínimo (alerta)</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.lote_id} className="border-t border-white/10">
                  <td className="px-4 py-2">{s.sucursal_nombre}</td>
                  <td className="px-4 py-2">${Number(s.precio_mxn).toFixed(2)}</td>
                  <td
                    className={`px-4 py-2 ${
                      s.stock <= 0
                        ? "text-brand-red"
                        : s.stock <= s.umbral_stock
                          ? "text-yellow-500"
                          : ""
                    }`}
                  >
                    {s.stock}
                  </td>
                  <td className="px-4 py-2">
                    <UmbralForm id={s.lote_id} umbralActual={s.umbral_stock} />
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
