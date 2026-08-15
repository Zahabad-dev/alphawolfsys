import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { getBaseUrl } from "@/lib/url";
import { generarQrConLogo, cmAPx } from "@/lib/qr";
import PrintButton from "./print-button";
import QrControlsForm from "./qr-controls-form";

interface PrecioRow {
  id: number;
  precio_mxn: string;
  qr_token: string;
  sucursal_clave: string;
}

const SIZE_CM_DEFAULT = 2;
const SIZE_CM_MIN = 1;
const SIZE_CM_MAX = 10;
const COPIAS_DEFAULT = 24;
const COPIAS_MAX = 200;

function num(param: string | string[] | undefined, fallback: number, min: number, max: number) {
  const n = Number(typeof param === "string" ? param : fallback);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

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
  if (!session || session.user.rol === "vendedor") redirect("/login");

  const { rows } = await query<PrecioRow>(
    `SELECT l.id, l.precio_mxn, l.qr_token, s.clave AS sucursal_clave
     FROM lotes l JOIN sucursales s ON s.id = l.sucursal_id
     WHERE l.id = $1`,
    [id]
  );
  const precio = rows[0];
  if (!precio) notFound();

  const sizeCm = num(sp.size_cm, SIZE_CM_DEFAULT, SIZE_CM_MIN, SIZE_CM_MAX);
  const modo = sp.modo === "hoja" ? "hoja" : "unico";
  const copias = num(sp.copias, COPIAS_DEFAULT, 1, COPIAS_MAX);

  const sizePx = cmAPx(sizeCm);

  const baseUrl = await getBaseUrl();
  const scanUrl = `${baseUrl}/scan/${precio.qr_token}`;
  const qr = await generarQrConLogo(scanUrl, sizePx);
  const qrDataUrl = `data:image/png;base64,${qr.buffer.toString("base64")}`;
  const outerCm = (sizeCm * qr.size) / sizePx;
  const etiqueta = `$${Number(precio.precio_mxn).toFixed(2)} · ${precio.sucursal_clave}`;

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 text-black print:p-0">
      <style>{`@page { margin: 1cm; }`}</style>

      <QrControlsForm
        sizeCm={sizeCm}
        modo={modo}
        copias={copias}
        sizeCmMin={SIZE_CM_MIN}
        sizeCmMax={SIZE_CM_MAX}
        copiasMax={COPIAS_MAX}
      />

      {modo === "unico" ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-black/10 p-8 print:border-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt={`QR ${etiqueta}`}
            style={{ width: `${outerCm}cm`, height: `${outerCm}cm` }}
          />
          <p className="text-sm text-black/70">{etiqueta}</p>
        </div>
      ) : (
        <div
          className="grid w-full justify-center gap-x-3 gap-y-4 print:gap-x-2 print:gap-y-3"
          style={{ gridTemplateColumns: `repeat(auto-fill, ${outerCm}cm)` }}
        >
          {Array.from({ length: copias }).map((_, i) => (
            <div key={i} className="flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt={`QR ${etiqueta}`}
                style={{ width: `${outerCm}cm`, height: `${outerCm}cm` }}
              />
              <p style={{ fontSize: "0.3cm" }} className="text-black/70">
                {etiqueta}
              </p>
            </div>
          ))}
        </div>
      )}

      <PrintButton />
    </div>
  );
}
