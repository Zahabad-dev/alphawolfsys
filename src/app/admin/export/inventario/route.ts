import { auth } from "@/auth";
import { query } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";

interface StockRow {
  sucursal_nombre: string;
  precio_mxn: string;
  stock: number;
}

export async function GET() {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") {
    return new Response("No autorizado", { status: 403 });
  }

  const { rows } = await query<StockRow>(
    `SELECT s.nombre AS sucursal_nombre, sa.precio_mxn, sa.stock
     FROM stock_actual sa
     JOIN sucursales s ON s.id = sa.sucursal_id
     ORDER BY s.nombre, sa.precio_mxn`
  );

  const csv = toCsv(
    ["Sucursal", "Precio", "Stock"],
    rows.map((r) => [r.sucursal_nombre, r.precio_mxn, r.stock])
  );

  return csvResponse("inventario.csv", csv);
}
