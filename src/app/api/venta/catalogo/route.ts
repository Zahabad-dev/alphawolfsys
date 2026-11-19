import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";

interface LoteRow {
  qr_token: string;
  nombre: string;
  precio_mxn: string;
  /** La vista stock_actual da un bigint: pg lo entrega como texto. */
  stock: string | number;
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

  // Etiquetas nuevas (por modelo): cada modelo apunta al lote propio con su precio (el mismo stock que sus
  // etiquetas de precio). El precio es el del modelo en esta sucursal; si aquí no tiene, el del Almacén,
  // igual que la etiqueta de precio del Almacén se acepta en cualquier sucursal que maneje ese precio.
  // Si la base aún no tiene las tablas de modelos, el catálogo queda como siempre.
  try {
    const { rows: modelos } = await query<LoteRow>(
      `SELECT m.qr_token, m.nombre, l.precio_mxn, COALESCE(sa.stock, 0) AS stock
         FROM modelos m
         JOIN LATERAL (
             SELECT pm.precio_mxn FROM precios_modelo pm JOIN sucursales s ON s.id = pm.sucursal_id
              WHERE pm.modelo_id = m.id AND pm.vigente_hasta IS NULL AND (pm.sucursal_id = $1 OR s.tipo = 'almacen')
              ORDER BY (pm.sucursal_id = $1) DESC LIMIT 1
         ) pm ON true
         JOIN LATERAL (
           SELECT id, precio_mxn FROM lotes
            WHERE sucursal_id = $1 AND precio_mxn = pm.precio_mxn AND activo
            ORDER BY id LIMIT 1
         ) l ON true
         LEFT JOIN stock_actual sa ON sa.lote_id = l.id`,
      [user.sucursalId]
    );
    rows.push(...modelos);
  } catch (err) {
    if ((err as { code?: string }).code !== "42P01") throw err;
  }

  return NextResponse.json({
    items: rows.map((r) => ({
      qrToken: r.qr_token,
      nombre: r.nombre,
      precio: Number(r.precio_mxn),
      stock: Number(r.stock),
    })),
  });
}
