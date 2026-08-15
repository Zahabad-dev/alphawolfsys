import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";

interface StockRow {
  lote_id: number;
  nombre: string;
  precio_mxn: string;
  stock: number;
}

export default async function InventarioPage() {
  const session = await auth();
  const user = session!.user;

  if (user.rol !== "vendedor" || !user.sucursalId) {
    redirect("/venta");
  }

  const { rows: stock } = await query<StockRow>(
    `SELECT lote_id, nombre, precio_mxn, stock
     FROM stock_actual
     WHERE sucursal_id = $1
     ORDER BY precio_mxn`,
    [user.sucursalId]
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Inventario" subtitulo="Tu sucursal" />
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-gray2 text-brand-cream/70">
              <tr>
                <th className="px-4 py-2">Precio</th>
                <th className="px-4 py-2">Stock</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.lote_id} className="border-t border-white/10">
                  <td className="px-4 py-2">${Number(s.precio_mxn).toFixed(2)}</td>
                  <td className={`px-4 py-2 ${s.stock <= 0 ? "text-brand-red" : ""}`}>
                    {s.stock}
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
