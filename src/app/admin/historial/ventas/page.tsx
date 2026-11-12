import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import { formatearHora, hoyISO, primerDiaDelMes } from "@/lib/fechas";
import { miles } from "@/lib/formato";
import {
  agruparVentas,
  DIA_MINIMO,
  diaLargo,
  diaValido,
  enteroPositivo,
  type MovimientoVenta,
} from "@/lib/historial";

interface Opcion {
  id: number;
  nombre: string;
}

/** Tope de piezas que se leen de una vez: con ~3,000 ventas al mes sobra, y avisa si se rebasa. */
const TOPE_PIEZAS = 20000;

const campo =
  "rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream";

export default async function AdminVentasPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") redirect("/login");

  const sp = await searchParams;
  const texto = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const hoy = hoyISO();
  const desde = diaValido(texto("desde")) ?? primerDiaDelMes();
  const hastaPedido = diaValido(texto("hasta")) ?? hoy;
  // Si se escribe un rango al revés, se acomoda en lugar de mostrar vacío.
  const [d1, d2] = desde <= hastaPedido ? [desde, hastaPedido] : [hastaPedido, desde];
  const sucursalSel = enteroPositivo(texto("sucursal"));
  const vendedorSel = enteroPositivo(texto("vendedor"));

  const params: unknown[] = [d1, d2];
  const condiciones = [
    "m.tipo = 'venta'",
    "m.creado_en >= $1::date",
    "m.creado_en < ($2::date + interval '1 day')",
  ];
  if (sucursalSel) {
    params.push(sucursalSel);
    condiciones.push(`m.sucursal_id = $${params.length}`);
  }
  if (vendedorSel) {
    params.push(vendedorSel);
    condiciones.push(`m.usuario_id = $${params.length}`);
  }

  const [{ rows: sucursales }, { rows: vendedores }, { rows: piezas }] = await Promise.all([
    query<Opcion>("SELECT id, nombre FROM sucursales WHERE tipo <> 'almacen' ORDER BY nombre"),
    query<Opcion>("SELECT id, nombre FROM usuarios WHERE rol = 'vendedor' ORDER BY nombre"),
    query<MovimientoVenta>(
      `SELECT m.id, m.creado_en, to_char(m.creado_en, 'YYYY-MM-DD') AS dia,
              s.nombre AS sucursal_nombre, u.nombre AS usuario_nombre,
              COALESCE(m.precio_unitario_mxn, l.precio_mxn) AS precio_mxn, m.cantidad, m.venta_id
       FROM movimientos_inventario m
       JOIN sucursales s ON s.id = m.sucursal_id
       JOIN usuarios u ON u.id = m.usuario_id
       JOIN lotes l ON l.id = m.lote_id
       WHERE ${condiciones.join(" AND ")}
       ORDER BY m.creado_en DESC, m.id DESC
       LIMIT ${TOPE_PIEZAS + 1}`,
      params
    ),
  ]);

  const truncado = piezas.length > TOPE_PIEZAS;
  const ventas = agruparVentas(truncado ? piezas.slice(0, TOPE_PIEZAS) : piezas);

  // Días de la más reciente a la más antigua, con su conteo.
  const dias = new Map<string, { ventas: typeof ventas; piezas: number }>();
  for (const v of ventas) {
    const d = dias.get(v.dia) ?? { ventas: [], piezas: 0 };
    d.ventas.push(v);
    d.piezas += v.piezas;
    dias.set(v.dia, d);
  }
  const totalPiezas = ventas.reduce((t, v) => t + v.piezas, 0);
  const csvParams = new URLSearchParams({ tipo: "venta", desde: d1, hasta: d2 });
  if (sucursalSel) csvParams.set("sucursal_id", String(sucursalSel));
  if (vendedorSel) csvParams.set("usuario_id", String(vendedorSel));

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Ventas" subtitulo="Todas las ventas, por día" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <form
          method="get"
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4"
        >
          <label className="flex flex-col gap-1 text-xs text-brand-cream/60">
            Sucursal
            <select name="sucursal" defaultValue={sucursalSel ? String(sucursalSel) : ""} className={campo}>
              <option value="">Todas</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-brand-cream/60">
            Vendedor
            <select name="vendedor" defaultValue={vendedorSel ? String(vendedorSel) : ""} className={campo}>
              <option value="">Todos</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-brand-cream/60">
            Desde
            <input name="desde" type="date" defaultValue={d1} min={DIA_MINIMO} max={hoy} className={campo} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-brand-cream/60">
            Hasta
            <input name="hasta" type="date" defaultValue={d2} min={DIA_MINIMO} max={hoy} className={campo} />
          </label>
          <button
            type="submit"
            className="rounded-full bg-brand-gold px-4 py-1.5 text-sm font-semibold text-brand-black"
          >
            Filtrar
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/historial/ventas"
            className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-brand-cream/80 hover:border-brand-gold hover:text-brand-gold"
          >
            Este mes
          </Link>
          <a
            href={`/admin/export/movimientos?${csvParams.toString()}`}
            className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-brand-cream/80 hover:border-brand-gold hover:text-brand-gold"
          >
            Exportar CSV
          </a>
          <Link
            href="/admin/historial"
            className="ml-auto rounded-full px-3 py-1.5 text-sm text-brand-cream/70 hover:text-brand-gold"
          >
            ← Historial por sucursal
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-brand-cream/80">
          <span className="rounded-full bg-brand-gray2 px-3 py-1">
            <strong className="text-brand-gold">{miles(ventas.length)}</strong> ventas
          </span>
          <span className="rounded-full bg-brand-gray2 px-3 py-1">
            <strong className="text-brand-gold">{miles(totalPiezas)}</strong> piezas
          </span>
          <span className="rounded-full bg-brand-gray2 px-3 py-1">
            <strong className="text-brand-gold">{dias.size}</strong> {dias.size === 1 ? "día" : "días"} con ventas
          </span>
          {truncado && (
            <span className="text-brand-red">
              Hay más de {miles(TOPE_PIEZAS)} piezas en este rango: se muestran las más recientes. Acorta las fechas.
            </span>
          )}
        </div>

        {[...dias.entries()].map(([dia, d], i) => (
          <details key={dia} open={i < 3} className="rounded-2xl border border-white/10 bg-brand-gray2/40">
            <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
              <span className="font-semibold text-brand-gold">{diaLargo(dia)}</span>
              <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 text-xs text-brand-gold">
                {miles(d.ventas.length)} {d.ventas.length === 1 ? "venta" : "ventas"}
              </span>
              <span className="text-xs text-brand-cream/70">{miles(d.piezas)} piezas</span>
            </summary>
            <div className="border-t border-white/10 px-4 py-2 text-right">
              {/* Fuera del <summary>: un enlace dentro de él también abriría o cerraría el día. */}
              <Link href={`/admin/historial?dia=${dia}`} className="text-xs text-brand-cream/70 hover:text-brand-gold">
                Ver cuadre del día →
              </Link>
            </div>
            <div className="overflow-x-auto border-t border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="text-brand-cream/70">
                  <tr>
                    <th scope="col" className="px-4 py-2">Hora</th>
                    <th scope="col" className="px-4 py-2">Sucursal</th>
                    <th scope="col" className="px-4 py-2">Vendedor</th>
                    <th scope="col" className="px-4 py-2">Detalle</th>
                    <th scope="col" className="px-4 py-2 text-right">Piezas</th>
                  </tr>
                </thead>
                <tbody>
                  {d.ventas.map((v) => (
                    <tr key={v.clave} className="border-t border-white/10">
                      <td className="whitespace-nowrap px-4 py-2 text-brand-cream/70">{formatearHora(v.hora)}</td>
                      <td className="px-4 py-2">{v.sucursal}</td>
                      <td className="px-4 py-2">{v.usuario}</td>
                      <td className="px-4 py-2">{v.detalle}</td>
                      <td className="px-4 py-2 text-right font-semibold text-brand-red">−{miles(v.piezas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}

        {ventas.length === 0 && (
          <p className="rounded-2xl border border-white/10 p-6 text-center text-sm text-brand-cream/70">
            Sin ventas con estos filtros.
          </p>
        )}
      </main>
    </div>
  );
}
