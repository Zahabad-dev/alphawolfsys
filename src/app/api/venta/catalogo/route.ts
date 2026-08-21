import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

interface LoteRow {
  qr_token: string;
  nombre: string;
  precio_mxn: string;
  stock: number;
}

export async function GET() {
  const session = await auth();
  const user = session?.user;
  if (!user || user.rol !== "vendedor" || !user.sucursalId) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { rows } = await query<LoteRow>(
    `SELECT l.qr_token, l.nombre, l.precio_mxn, COALESCE(sa.stock, 0) AS stock
     FROM lotes l
     LEFT JOIN stock_actual sa ON sa.lote_id = l.id
     WHERE l.sucursal_id = $1 AND l.activo = true`,
    [user.sucursalId]
  );

  return NextResponse.json({
    items: rows.map((r) => ({
      qrToken: r.qr_token,
      nombre: r.nombre,
      precio: Number(r.precio_mxn),
      stock: r.stock,
    })),
  });
}
