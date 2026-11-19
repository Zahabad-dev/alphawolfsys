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
import ConteoForm from "./conteo-form";
import { conteoPorModelo } from "@/lib/conteo-modelos";
import { puedeGestionar } from "@/lib/permisos";
import { formatearFechaHora } from "@/lib/fechas";

interface RegistroRow {
  id: number;
  tipo: string;
  piezas: number;
  nota: string | null;
  creado_en: Date | string;
  sucursal: string;
  quien: string | null;
}

/** Últimos registros de piezas etiquetadas y ventas por sucursal del modelo (null si falta la migración 016). */
async function cargarConteo(modeloId: number) {
  const conteo = await conteoPorModelo(modeloId);
  if (!conteo) return null;
  const [{ rows: registros }, { rows: porSucursal }, { rows: sucursales }] = await Promise.all([
    query<RegistroRow>(
      `SELECT e.id, e.tipo, e.piezas, e.nota, e.creado_en, s.nombre AS sucursal, u.nombre AS quien
         FROM entradas_modelo e JOIN sucursales s ON s.id = e.sucursal_id
         LEFT JOIN usuarios u ON u.id = e.registrado_por
        WHERE e.modelo_id = $1 ORDER BY e.creado_en DESC, e.id DESC LIMIT 10`,
      [modeloId]
    ),
    query<{ sucursal: string; vendidas: string }>(
      `SELECT s.nombre AS sucursal, -SUM(m.cantidad) AS vendidas
         FROM movimientos_inventario m JOIN sucursales s ON s.id = m.sucursal_id
        WHERE m.modelo_id = $1 AND m.tipo = 'venta'
        GROUP BY s.nombre ORDER BY s.nombre`,
      [modeloId]
    ),
    query<{ id: number; nombre: string; tipo: string }>(
      "SELECT id, nombre, tipo FROM sucursales WHERE activa ORDER BY tipo = 'almacen' DESC, nombre"
    ),
  ]);
  return { total: conteo.get(modeloId) ?? { entradas: 0, vendidas: 0, salidas: 0, existencia: 0 }, registros, porSucursal, sucursales };
}

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
  const gestiona = puedeGestionar(session.user.rol);

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

  const conteo = await cargarConteo(id);

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

      {conteo === null ? (
        gestiona && (
          <p className="w-full max-w-3xl rounded-xl border border-yellow-600/40 bg-yellow-100 p-3 text-sm print:hidden">
            Para llevar el conteo de piezas por modelo falta preparar la base de datos (migración{" "}
            <code>016_entradas_modelo.sql</code>). Lo demás funciona igual.
          </p>
        )
      ) : (
        <section className="flex w-full max-w-3xl flex-col gap-3 print:hidden">
          <h2 className="text-base font-semibold">Conteo de este modelo (control interno)</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Etiquetadas", conteo.total.entradas],
              ["Vendidas", conteo.total.vendidas],
              ["Otras salidas", conteo.total.salidas],
              ["Quedan", conteo.total.existencia],
            ].map(([t, n]) => (
              <div key={t} className={`rounded-xl border p-3 ${t === "Quedan" ? "border-black" : "border-black/10"}`}>
                <p className="text-xs text-black/60">{t}</p>
                <p className="text-2xl font-semibold">{n}</p>
              </div>
            ))}
          </div>
          {conteo.porSucursal.length > 0 && (
            <p className="text-sm text-black/70">
              Vendidas por sucursal: {conteo.porSucursal.map((v) => `${v.sucursal} ${Number(v.vendidas)}`).join(" · ")}
            </p>
          )}
          <p className="text-xs text-black/60">
            Solo cuentan las ventas hechas con esta etiqueta nueva; las prendas con etiqueta de precio no restan aquí.
          </p>
          {gestiona && conteo.sucursales.length > 0 && (
            <ConteoForm
              key={copias}
              modeloId={id}
              sucursales={conteo.sucursales}
              sucursalInicial={conteo.sucursales.find((s) => s.tipo === "almacen")?.id ?? conteo.sucursales[0]?.id ?? 0}
              copias={copias}
            />
          )}
          {conteo.registros.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-black/10">
              <table className="w-full text-left text-sm">
                <thead className="text-black/60">
                  <tr>
                    <th scope="col" className="px-3 py-2">Cuándo</th>
                    <th scope="col" className="px-3 py-2">Piezas</th>
                    <th scope="col" className="px-3 py-2">Dónde</th>
                    <th scope="col" className="px-3 py-2">Quién</th>
                    <th scope="col" className="px-3 py-2">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {conteo.registros.map((r) => (
                    <tr key={r.id} className="border-t border-black/10">
                      <td className="px-3 py-2">{formatearFechaHora(r.creado_en)}</td>
                      <td className="px-3 py-2 font-semibold">
                        {r.piezas > 0 ? `+${r.piezas}` : r.piezas}
                        {r.tipo === "correccion" && <span className="ml-1 text-xs font-normal text-black/60">corrección</span>}
                      </td>
                      <td className="px-3 py-2">{r.sucursal}</td>
                      <td className="px-3 py-2">{r.quien ?? "—"}</td>
                      <td className="px-3 py-2 text-black/70">{r.nota ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
