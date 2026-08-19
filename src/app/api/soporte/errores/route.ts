import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  const token = request.headers.get("x-soporte-token");
  if (!process.env.SOPORTE_WEBHOOK_TOKEN || token !== process.env.SOPORTE_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const origen = body?.origen;
  const mensaje = body?.mensaje;
  const workflow = typeof body?.workflow === "string" ? body.workflow : null;
  const detalle = body?.detalle ?? null;

  if (typeof origen !== "string" || !origen.trim()) {
    return NextResponse.json({ error: "Falta 'origen'." }, { status: 400 });
  }
  if (typeof mensaje !== "string" || !mensaje.trim()) {
    return NextResponse.json({ error: "Falta 'mensaje'." }, { status: 400 });
  }

  await query(
    `INSERT INTO errores_soporte (origen, workflow, mensaje, detalle)
     VALUES ($1, $2, $3, $4)`,
    [origen.trim(), workflow, mensaje.trim(), detalle ? JSON.stringify(detalle) : null]
  );

  return NextResponse.json({ success: true });
}
