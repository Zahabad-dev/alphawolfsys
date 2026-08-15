import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import CorteForm from "./corte-form";

interface StockRow {
  lote_id: number;
  nombre: string;
  precio_mxn: string;
  stock: number;
}

export default async function AdminCortePage() {
  const session = await auth();
  if (!session || session.user.rol !== "admin") redirect("/login");

  const { rows: stock } = await query<StockRow>(
    `SELECT sa.lote_id, sa.nombre, sa.precio_mxn, sa.stock
     FROM stock_actual sa
     JOIN sucursales s ON s.id = sa.sucursal_id
     WHERE s.tipo = 'almacen'
     ORDER BY sa.precio_mxn`
  );

  const lotesParaForm = stock.map((s) => ({ id: s.lote_id, etiqueta: `${s.nombre}` }));

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Corte" subtitulo="Piezas nuevas al Almacén Central" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        {lotesParaForm.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-brand-gray2 p-4 text-sm text-brand-cream/70">
            El Almacén Central todavía no tiene lotes. Ve a{" "}
            <a href="/admin/lotes" className="text-brand-gold underline">
              Lotes
            </a>{" "}
            y crea uno seleccionando &quot;Almacén Central&quot; como sucursal.
          </p>
        ) : (
          <CorteForm lotes={lotesParaForm} />
        )}

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-gray2 text-brand-cream/70">
              <tr>
                <th className="px-4 py-2">Lote</th>
                <th className="px-4 py-2">Precio</th>
                <th className="px-4 py-2">Stock en Almacén</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.lote_id} className="border-t border-white/10">
                  <td className="px-4 py-2">{s.nombre}</td>
                  <td className="px-4 py-2">${Number(s.precio_mxn).toFixed(2)}</td>
                  <td className="px-4 py-2">{s.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
