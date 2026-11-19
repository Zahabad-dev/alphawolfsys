import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Roboto_Condensed } from "next/font/google";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { enteroPositivo } from "@/lib/historial";
import { cmAPx, generarQrConLogo } from "@/lib/qr";
import { ETIQUETAS_NUEVAS_SE_COBRAN, textoEtiquetaAuto } from "@/lib/modelos";
import { dinero } from "@/lib/formato";
import QrControlsForm from "@/app/admin/precios/[id]/qr/qr-controls-form";
import PrintButton from "@/app/admin/precios/[id]/qr/print-button";
import Etiquetas from "./etiquetas";
import DescargarEtiqueta from "./descargar-etiqueta";

// Letra angosta para que el nombre del modelo quepa en 2 renglones de una etiqueta de 2 cm.
const condensada = Roboto_Condensed({ subsets: ["latin"], weight: "700", display: "block" });

interface ModeloRow {
  id: number;
  nombre: string;
  nombre_base: string;
  variante: string | null;
  distintivo: string | null;
  color: string | null;
  texto_etiqueta: string | null;
  qr_token: string;
  activo: boolean;
}

interface PrecioSucursal {
  id: number;
  nombre: string;
  clave: string;
  precio_mxn: string;
}

const SIZE_CM_DEFAULT = 2;
const SIZE_CM_MIN = 1.5;
const SIZE_CM_MAX = 6;
const COPIAS_DEFAULT = 24;
const COPIAS_MAX = 200;

function num(param: string | string[] | undefined, fallback: number, min: number, max: number) {
  const n = Number(typeof param === "string" ? param : fallback);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export default async function EtiquetaModeloPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") redirect("/login");

  const id = enteroPositivo((await params).id);
  if (!id) notFound();
  const sp = await searchParams;

  const { rows } = await query<ModeloRow>(
    `SELECT id, nombre, nombre_base, variante, distintivo, color, texto_etiqueta, qr_token, activo
       FROM modelos WHERE id = $1`,
    [id]
  );
  const modelo = rows[0];
  if (!modelo) notFound();

  const texto =
    modelo.texto_etiqueta ??
    textoEtiquetaAuto({
      base: modelo.nombre_base,
      variante: modelo.variante ?? "",
      distintivo: modelo.distintivo ?? "",
      color: modelo.color ?? "",
    });

  // Precio vigente del modelo en cada sucursal; la etiqueta se imprime con el de la sucursal elegida
  // (por defecto el Almacén, que es donde se etiqueta). Al cobrar, la venta usará el de la sucursal que vende.
  const { rows: precios } = await query<PrecioSucursal>(
    `SELECT s.id, s.nombre, s.clave, pm.precio_mxn
       FROM precios_modelo pm JOIN sucursales s ON s.id = pm.sucursal_id
      WHERE pm.modelo_id = $1 AND pm.vigente_hasta IS NULL AND s.activa
      ORDER BY s.tipo = 'almacen' DESC, s.nombre`,
    [id]
  );
  const sucPedida = enteroPositivo(typeof sp.suc === "string" ? sp.suc : "");
  const elegida = precios.find((p) => p.id === sucPedida) ?? precios[0] ?? null;
  const precio = elegida ? `${dinero(Number(elegida.precio_mxn))} · ${elegida.clave}` : null;

  const sizeCm = num(sp.size_cm, SIZE_CM_DEFAULT, SIZE_CM_MIN, SIZE_CM_MAX);
  const modo = sp.modo === "hoja" ? "hoja" : "unico";
  const copias = modo === "hoja" ? num(sp.copias, COPIAS_DEFAULT, 1, COPIAS_MAX) : 1;
  // Sin logo al centro: el QR queda más limpio y se lee mejor a 2 cm (pedido del cliente).
  const sinLogo = true;

  const sizePx = cmAPx(sizeCm);
  const qr = await generarQrConLogo(modelo.qr_token, sizePx, { sinLogo });
  const qrSrc = `data:image/png;base64,${qr.buffer.toString("base64")}`;
  const ladoCm = (sizeCm * qr.size) / sizePx;

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 text-black print:p-0">
      <style>{`@page { margin: 1cm; }`}</style>

      <div className="flex w-full max-w-3xl flex-col gap-2 print:hidden">
        <Link href="/admin/modelos" className="text-sm text-black/60 underline">
          ← Volver a Modelos
        </Link>
        <h1 className="text-lg font-semibold">Etiqueta: {modelo.nombre}</h1>
        {!modelo.activo && <p className="text-sm text-black/70">Este modelo está descontinuado.</p>}
        {!ETIQUETAS_NUEVAS_SE_COBRAN && (
          <p className="rounded-xl border border-yellow-600/40 bg-yellow-100 p-3 text-sm">
            <strong>Vista previa.</strong> Todavía no imprimas estas etiquetas para pegarlas: la venta aún no las lee.
            Las etiquetas que ya tienen pegadas siguen funcionando igual.
          </p>
        )}
      </div>

      <div className="flex w-full max-w-3xl flex-wrap items-center gap-2 text-sm print:hidden">
        <span className="text-black/70">Precio de:</span>
        {precios.length === 0 ? (
          <span className="text-black/70">
            este modelo todavía no tiene precio.{" "}
            <Link href={`/admin/modelos/${id}/precios`} className="underline">
              Ponerle precio
            </Link>
          </span>
        ) : (
          precios.map((p) => {
            const q = new URLSearchParams();
            for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "suc") q.set(k, v);
            q.set("suc", String(p.id));
            return (
              <Link
                key={p.id}
                href={`/admin/modelos/${id}/etiqueta?${q}`}
                aria-current={elegida?.id === p.id ? "true" : undefined}
                className={`rounded-full border px-3 py-1 ${elegida?.id === p.id ? "border-black bg-black text-white" : "border-black/20 hover:border-black"}`}
              >
                {p.nombre} {dinero(Number(p.precio_mxn))}
              </Link>
            );
          })
        )}
      </div>

      <QrControlsForm
        extra={elegida ? { suc: String(elegida.id) } : undefined}
        sizeCm={sizeCm}
        modo={modo}
        copias={copias}
        sinLogo={sinLogo}
        mostrarOpcionLogo={false}
        sizeCmMin={SIZE_CM_MIN}
        sizeCmMax={SIZE_CM_MAX}
        copiasMax={COPIAS_MAX}
      />

      <Etiquetas
        qrSrc={qrSrc}
        ladoCm={ladoCm}
        texto={texto}
        precio={precio}
        copias={copias}
        claseLetra={condensada.className}
      />

      {ETIQUETAS_NUEVAS_SE_COBRAN && (
        <>
          <DescargarEtiqueta
            qrSrc={qrSrc}
            ladoCm={ladoCm}
            texto={texto}
            precio={precio}
            familiaLetra={condensada.style.fontFamily}
            nombreArchivo={`etiqueta-${texto}${elegida ? `-${elegida.clave}` : ""}`
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")}
          />
          <PrintButton />
        </>
      )}
    </div>
  );
}
