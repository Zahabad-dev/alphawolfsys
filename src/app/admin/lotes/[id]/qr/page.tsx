import QRCode from "qrcode";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { getBaseUrl } from "@/lib/url";
import PrintButton from "./print-button";

interface LoteRow {
  id: number;
  nombre: string;
  precio_mxn: string;
  qr_token: string;
  sucursal_nombre: string;
}

export default async function LoteQrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  if (!session || session.user.rol !== "admin") redirect("/login");

  const { rows } = await query<LoteRow>(
    `SELECT l.id, l.nombre, l.precio_mxn, l.qr_token, s.nombre AS sucursal_nombre
     FROM lotes l JOIN sucursales s ON s.id = l.sucursal_id
     WHERE l.id = $1`,
    [id]
  );
  const lote = rows[0];
  if (!lote) notFound();

  const baseUrl = await getBaseUrl();
  const scanUrl = `${baseUrl}/scan/${lote.qr_token}`;
  const qrDataUrl = await QRCode.toDataURL(scanUrl, { width: 320, margin: 2 });

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 text-black print:p-0">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-black/10 p-8 print:border-0">
        <p className="text-lg font-semibold">{lote.sucursal_nombre}</p>
        <p className="text-2xl font-bold">{lote.nombre}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt={`QR ${lote.nombre}`} width={320} height={320} />
        <p className="text-3xl font-bold">${Number(lote.precio_mxn).toFixed(2)} MXN</p>
      </div>
      <PrintButton />
    </div>
  );
}
