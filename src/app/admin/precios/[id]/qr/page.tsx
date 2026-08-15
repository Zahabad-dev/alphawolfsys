import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { getBaseUrl } from "@/lib/url";
import { generarQrConLogo } from "@/lib/qr";
import PrintButton from "./print-button";

interface PrecioRow {
  id: number;
  precio_mxn: string;
  qr_token: string;
  sucursal_clave: string;
}

const TAMANO_DEFAULT = 480;
const TAMANO_MIN = 150;
const TAMANO_MAX = 1200;

export default async function PrecioQrPage({
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

  const { rows } = await query<PrecioRow>(
    `SELECT l.id, l.precio_mxn, l.qr_token, s.clave AS sucursal_clave
     FROM lotes l JOIN sucursales s ON s.id = l.sucursal_id
     WHERE l.id = $1`,
    [id]
  );
  const precio = rows[0];
  if (!precio) notFound();

  const sizeParam = Number(typeof sp.size === "string" ? sp.size : TAMANO_DEFAULT);
  const size = Number.isFinite(sizeParam)
    ? Math.min(TAMANO_MAX, Math.max(TAMANO_MIN, sizeParam))
    : TAMANO_DEFAULT;

  const baseUrl = await getBaseUrl();
  const scanUrl = `${baseUrl}/scan/${precio.qr_token}`;
  const qr = await generarQrConLogo(scanUrl, size);
  const qrDataUrl = `data:image/png;base64,${qr.buffer.toString("base64")}`;

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 text-black print:p-0">
      <form method="get" className="flex items-end gap-3 print:hidden">
        <label className="flex flex-col gap-1 text-sm text-black/70">
          Tamaño del QR (px)
          <input
            name="size"
            type="number"
            min={TAMANO_MIN}
            max={TAMANO_MAX}
            step={10}
            defaultValue={size}
            className="w-28 rounded-lg border border-black/20 px-3 py-2 text-black"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white"
        >
          Generar
        </button>
      </form>

      <div className="flex flex-col items-center gap-2 rounded-2xl border border-black/10 p-8 print:border-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt={`QR $${Number(precio.precio_mxn).toFixed(2)} ${precio.sucursal_clave}`}
          width={qr.size}
          height={qr.size}
          style={{ width: qr.size, height: qr.size }}
        />
        <p className="text-sm text-black/70">
          ${Number(precio.precio_mxn).toFixed(2)} · {precio.sucursal_clave}
        </p>
      </div>
      <PrintButton />
    </div>
  );
}
