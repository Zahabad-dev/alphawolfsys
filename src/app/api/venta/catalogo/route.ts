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

  // El QR físico puede seguir siendo el de Almacén (traspaso hecho sin
  // reetiquetar). Por eso el catálogo incluye, además de los propios
  // qr_token, los qr_token de OTRAS sucursales cuyo precio coincida con uno
  // propio — apuntando siempre al stock/nombre del lote propio, nunca al
  // ajeno. Así el escaneo encuentra el precio sin señal, igual que
  // registrarVentaAction ya hace en el servidor.
  const { rows } = await query<LoteRow>(
    `WITH propios AS (
       SELECT l.id, l.nombre, l.precio_mxn, COALESCE(sa.stock, 0) AS stock
       FROM lotes l
       LEFT JOIN stock_actual sa ON sa.lote_id = l.id
       WHERE l.sucursal_id = $1 AND l.activo = true
     )
     SELECT DISTINCT otros.qr_token, propios.nombre, propios.precio_mxn, propios.stock
     FROM lotes otros
     JOIN propios ON propios.precio_mxn = otros.precio_mxn
     WHERE otros.activo = true`,
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
