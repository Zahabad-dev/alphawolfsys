import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { getBaseUrl } from "@/lib/url";
import { generarQrConLogo } from "@/lib/qr";
import PrintButton from "./print-button";

interface LoteRow {
  id: number;
  nombre: string;
  precio_mxn: string;
  qr_token: string;
  sucursal_nombre: string;
}

const TAMANOS = [240, 320, 480, 640, 800, 1000] as const;
const TAMANO_DEFAULT = 480;

export default async function LoteQrPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

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

  const sizeParam = Number(typeof sp.size === "string" ? sp.size : TAMANO_DEFAULT);
  const size = Number.isFinite(sizeParam) ? Math.min(1200, Math.max(150, sizeParam)) : TAMANO_DEFAULT;

  const baseUrl = await getBaseUrl();
  const scanUrl = `${baseUrl}/scan/${lote.qr_token}`;
  const qr = await generarQrConLogo(scanUrl, size);
  const qrDataUrl = `data:image/png;base64,${qr.buffer.toString("base64")}`;

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 text-black print:p-0">
      <form
        method="get"
        className="flex items-end gap-3 print:hidden"
      >
        <label className="flex flex-col gap-1 text-sm text-black/70">
          Tamaño del QR
          <select
            name="size"
            defaultValue={size}
            className="rounded-lg border border-black/20 px-3 py-2 text-black"
          >
            {TAMANOS.map((t) => (
              <option key={t} value={t}>
                {t}×{t}px
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white"
        >
          Generar
        </button>
      </form>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-black/10 p-8 print:border-0">
        <p className="text-lg font-semibold">{lote.sucursal_nombre}</p>
        <p className="text-2xl font-bold">{lote.nombre}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt={`QR ${lote.nombre}`}
          width={qr.size}
          height={qr.size}
          style={{ width: qr.size, height: qr.size }}
        />
        <p className="text-3xl font-bold">${Number(lote.precio_mxn).toFixed(2)} MXN</p>
      </div>
      <PrintButton />
    </div>
  );
}
