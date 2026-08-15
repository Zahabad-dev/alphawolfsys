import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";

const TIPOS = [
  "entrada",
  "venta",
  "ajuste",
  "corte",
  "traspaso_salida",
  "traspaso_entrada",
] as const;

interface MovimientoRow {
  creado_en: string;
  sucursal_nombre: string;
  lote_nombre: string;
  tipo: string;
  cantidad: number;
  precio_unitario_mxn: string | null;
  usuario_nombre: string;
  nota: string | null;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") {
    return new Response("No autorizado", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const sucursalId = searchParams.get("sucursal_id");
  const tipo = searchParams.get("tipo");
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");

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

  const { rows } = await query<MovimientoRow>(
    `SELECT m.creado_en, s.nombre AS sucursal_nombre, l.nombre AS lote_nombre,
            m.tipo, m.cantidad, m.precio_unitario_mxn, u.nombre AS usuario_nombre, m.nota
     FROM movimientos_inventario m
     JOIN sucursales s ON s.id = m.sucursal_id
     JOIN lotes l ON l.id = m.lote_id
     JOIN usuarios u ON u.id = m.usuario_id
     ${where}
     ORDER BY m.creado_en DESC`,
    params
  );

  const csv = toCsv(
    ["Fecha", "Sucursal", "Precio", "Tipo", "Cantidad", "Precio unitario", "Usuario", "Nota"],
    rows.map((r) => [
      new Date(r.creado_en).toLocaleString("es-MX"),
      r.sucursal_nombre,
      r.lote_nombre,
      r.tipo,
      r.cantidad,
      r.precio_unitario_mxn ?? "",
      r.usuario_nombre,
      r.nota ?? "",
    ])
  );

  return csvResponse("movimientos.csv", csv);
}
