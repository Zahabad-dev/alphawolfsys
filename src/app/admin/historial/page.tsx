import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import { formatearHora, hoyISO } from "@/lib/fechas";
import { miles } from "@/lib/formato";
import {
  armarLineas,
  diaLargo,
  DIA_MINIMO,
  diaValido,
  enteroPositivo,
  etiquetaTipo,
  sumarDias,
  type Linea,
  type MovimientoDia,
} from "@/lib/historial";
import { MarcaRevisar, signo, TablaLineas, TablaPrecios, type FilaPrecio } from "./tablas";

interface LugarResumen {
  id: number;
  nombre: string;
  tipo: string;
  inicio: number;
  entro: number;
  salio: number;
  cierre: number;
  revisar: number;
  negativos: number;
}

/**
 * Ventana del día en hora de México (la sesión de la base ya trabaja en esa zona).
 * Solo debe recibir "$1" o "$2" escritos en este archivo, nunca texto que venga del usuario.
 */
const DIA = (p: "$1" | "$2") => `m.creado_en >= ${p}::date AND m.creado_en < (${p}::date + interval '1 day')`;

const botonSecundario =
  "rounded-full border border-white/10 px-3 py-1.5 text-sm text-brand-cream/80 hover:border-brand-gold hover:text-brand-gold";

export default async function AdminHistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") redirect("/login");

  const sp = await searchParams;
  const hoy = hoyISO();
  const pedido = typeof sp.dia === "string" ? diaValido(sp.dia) : null;
  // No hay movimientos del futuro: cualquier fecha posterior a hoy se lleva a hoy.
  const dia = pedido && pedido <= hoy ? pedido : hoy;
  const esHoy = dia === hoy;
  const sucursalSel = enteroPositivo(typeof sp.sucursal === "string" ? sp.sucursal : "");

  const { rows: lugares } = await query<LugarResumen>(
    `SELECT s.id, s.nombre, s.tipo,
            COALESCE(SUM(m.cantidad) FILTER (WHERE m.creado_en < $1::date), 0)::int AS inicio,
            COALESCE(SUM(m.cantidad) FILTER (WHERE ${DIA("$1")} AND m.cantidad > 0), 0)::int AS entro,
            COALESCE(SUM(m.cantidad) FILTER (WHERE ${DIA("$1")} AND m.cantidad < 0), 0)::int AS salio,
            COALESCE(SUM(m.cantidad) FILTER (WHERE m.creado_en < ($1::date + interval '1 day')), 0)::int AS cierre,
            (COUNT(*) FILTER (WHERE ${DIA("$1")}
               AND ((m.tipo = 'ajuste' AND m.cantidad < 0) OR m.tipo = 'salida')))::int AS revisar,
            (SELECT COUNT(*) FROM stock_actual sa WHERE sa.sucursal_id = s.id AND sa.stock < 0)::int AS negativos
     FROM sucursales s
     LEFT JOIN movimientos_inventario m ON m.sucursal_id = s.id
     GROUP BY s.id, s.nombre, s.tipo
     ORDER BY (s.tipo = 'almacen') DESC, s.nombre`,
    [dia]
  );
  const lugar = lugares.find((l) => l.id === sucursalSel) ?? null;

  const urlHistorial = (cambios: { dia?: string; sucursal?: number | null }) => {
    const p = new URLSearchParams();
    const d = cambios.dia ?? dia;
    const s = cambios.sucursal === undefined ? lugar?.id ?? null : cambios.sucursal;
    if (d !== hoy) p.set("dia", d);
    if (s) p.set("sucursal", String(s));
    const qs = p.toString();
    return qs ? `/admin/historial?${qs}` : "/admin/historial";
  };

  let precios: FilaPrecio[] = [];
  let lineas: Linea[] = [];
  let porTipo = new Map<string, number>();

  if (lugar) {
    const [{ rows: preciosRows }, { rows: movs }] = await Promise.all([
      query<FilaPrecio>(
        `SELECT l.id AS lote_id, l.precio_mxn, l.activo,
                COALESCE(SUM(m.cantidad) FILTER (WHERE m.creado_en < $2::date), 0)::int AS inicio,
                COALESCE(SUM(m.cantidad) FILTER (WHERE ${DIA("$2")} AND m.cantidad > 0), 0)::int AS entro,
                COALESCE(SUM(m.cantidad) FILTER (WHERE ${DIA("$2")} AND m.cantidad < 0), 0)::int AS salio,
                COALESCE(SUM(m.cantidad) FILTER (WHERE m.creado_en < ($2::date + interval '1 day')), 0)::int AS cierre,
                COALESCE(SUM(m.cantidad), 0)::int AS actual
         FROM lotes l
         LEFT JOIN movimientos_inventario m ON m.lote_id = l.id
         WHERE l.sucursal_id = $1
         GROUP BY l.id, l.precio_mxn, l.activo
         ORDER BY l.precio_mxn`,
        [lugar.id, dia]
      ),
      // El precio que se muestra es el del momento del movimiento (precio_unitario_mxn), no el
      // actual del lote: si un precio cambia, los días pasados deben seguir diciendo lo que se vendió.
      query<MovimientoDia>(
        `SELECT m.id, m.creado_en, m.lote_id,
                COALESCE(m.precio_unitario_mxn, l.precio_mxn) AS precio_mxn,
                m.tipo, m.cantidad, u.nombre AS usuario_nombre, m.nota, m.motivo, m.venta_id,
                so.nombre AS otra_sucursal
         FROM movimientos_inventario m
         JOIN lotes l ON l.id = m.lote_id
         JOIN usuarios u ON u.id = m.usuario_id
         LEFT JOIN movimientos_inventario o
                ON o.traspaso_id = m.traspaso_id AND o.id <> m.id
         LEFT JOIN sucursales so ON so.id = o.sucursal_id
         WHERE m.sucursal_id = $1 AND ${DIA("$2")}
         ORDER BY m.creado_en, m.id`,
        [lugar.id, dia]
      ),
    ]);
    precios = preciosRows;
    lineas = armarLineas(movs, lugar.inicio);
    porTipo = movs.reduce(
      (acc, m) => acc.set(m.tipo, (acc.get(m.tipo) ?? 0) + m.cantidad),
      new Map<string, number>()
    );
  }

  const t = (tipo: string) => porTipo.get(tipo) ?? 0;
  const aRevisar = lineas.filter((l) => l.revisar);
  const lineasVenta = lineas.filter((l) => l.tipo === "venta");
  const lineasInventario = lineas.filter((l) => l.tipo !== "venta");
  const porVendedor = new Map<string, { nombre: string; piezas: number; ventas: number }>();
  for (const l of lineasVenta) {
    const v = porVendedor.get(l.usuario) ?? { nombre: l.usuario, piezas: 0, ventas: 0 };
    v.piezas += Math.abs(l.piezas);
    v.ventas += 1;
    porVendedor.set(l.usuario, v);
  }
  const resumenVendedores = [...porVendedor.values()].sort((a, b) => b.piezas - a.piezas);
  const preciosNegativos = precios.filter((p) => p.actual < 0);
  const preciosMovidos = precios.filter((p) => p.entro !== 0 || p.salio !== 0);
  const preciosQuietos = precios.filter((p) => p.entro === 0 && p.salio === 0);
  const csvParams = new URLSearchParams({ desde: dia, hasta: dia });
  if (lugar) csvParams.set("sucursal_id", String(lugar.id));
  const csvHref = `/admin/export/movimientos?${csvParams.toString()}`;

  // Cuadre del día: cada renglón es una causa de cambio en la existencia.
  const cuadre: Array<{ etiqueta: string; valor: number }> = lugar
    ? [
        { etiqueta: "Entradas y cortes", valor: t("entrada") + t("corte") },
        { etiqueta: "Traspasos recibidos", valor: t("traspaso_entrada") },
        { etiqueta: "Ventas", valor: t("venta") },
        { etiqueta: "Traspasos enviados", valor: t("traspaso_salida") },
        { etiqueta: "Salidas", valor: t("salida") },
        { etiqueta: "Ajustes", valor: t("ajuste") },
      ]
    : [];
  // Si la base algún día agrega un tipo de movimiento nuevo, "Otros" evita que el cuadre deje de sumar.
  if (lugar) {
    const otros = lugar.cierre - lugar.inicio - cuadre.reduce((suma, c) => suma + c.valor, 0);
    if (otros !== 0) cuadre.push({ etiqueta: "Otros", valor: otros });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Historial" subtitulo="Qué se registró, por sucursal y por día" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        {/* Día */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-brand-gray2 p-3">
          {dia > DIA_MINIMO && (
            <Link href={urlHistorial({ dia: sumarDias(dia, -1) })} className={botonSecundario}>
              ← Día anterior
            </Link>
          )}
          <form method="get" className="flex flex-wrap items-center gap-2">
            {lugar && <input type="hidden" name="sucursal" value={lugar.id} />}
            <label className="sr-only" htmlFor="dia-consulta">
              Día a consultar
            </label>
            <input
              id="dia-consulta"
              name="dia"
              type="date"
              defaultValue={dia}
              min={DIA_MINIMO}
              max={hoy}
              className="rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream"
            />
            <button
              type="submit"
              className="rounded-full bg-brand-gold px-4 py-1.5 text-sm font-semibold text-brand-black"
            >
              Ver día
            </button>
          </form>
          {!esHoy && (
            <Link href={urlHistorial({ dia: sumarDias(dia, 1) })} className={botonSecundario}>
              Día siguiente →
            </Link>
          )}
          {!esHoy && (
            <Link href={urlHistorial({ dia: hoy })} className={botonSecundario}>
              Hoy
            </Link>
          )}
          <Link
            href="/admin/historial/ventas"
            className="rounded-full border border-brand-gold/50 px-3 py-1.5 text-sm text-brand-gold hover:bg-brand-gold hover:text-brand-black"
          >
            Ver todas las ventas
          </Link>
          <p className="ml-auto text-sm font-semibold text-brand-gold">{diaLargo(dia)}</p>
        </div>

        {/* Sucursales */}
        <nav aria-label="Sucursales" className="flex flex-wrap gap-1">
          <Link
            href={urlHistorial({ sucursal: null })}
            aria-current={!lugar ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm ${
              !lugar ? "bg-brand-gold font-semibold text-brand-black" : "text-brand-cream/70 hover:bg-brand-gray2"
            }`}
          >
            Resumen
          </Link>
          {lugares.map((l) => (
            <Link
              key={l.id}
              href={urlHistorial({ sucursal: l.id })}
              aria-current={lugar?.id === l.id ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-sm ${
                lugar?.id === l.id
                  ? "bg-brand-gold font-semibold text-brand-black"
                  : "text-brand-cream/70 hover:bg-brand-gray2"
              }`}
            >
              {l.nombre}
              {l.revisar > 0 && <MarcaRevisar />}
            </Link>
          ))}
        </nav>

        {!lugar && (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <h2 className="sr-only">Resumen por sucursal</h2>
            {lugares.map((l) => (
              <Link
                key={l.id}
                href={urlHistorial({ sucursal: l.id })}
                className="rounded-2xl border border-white/10 bg-brand-gray2 p-4 hover:border-brand-gold"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-lg font-semibold text-brand-cream">{l.nombre}</p>
                  {(l.revisar > 0 || l.negativos > 0) && (
                    <span className="rounded-full bg-brand-red/15 px-2 py-0.5 text-xs text-brand-red">
                      {l.negativos > 0 ? "Existencia negativa" : `${l.revisar} por revisar`}
                    </span>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-center text-xs text-brand-cream/70 sm:grid-cols-4">
                  <div>
                    <dt>Inicio</dt>
                    <dd className="text-base font-semibold text-brand-cream">{miles(l.inicio)}</dd>
                  </div>
                  <div>
                    <dt>Entró</dt>
                    <dd className="text-base font-semibold text-brand-green">{signo(l.entro)}</dd>
                  </div>
                  <div>
                    <dt>Salió</dt>
                    <dd className="text-base font-semibold text-brand-red">{signo(l.salio)}</dd>
                  </div>
                  <div>
                    <dt>Cierre</dt>
                    <dd className="text-base font-semibold text-brand-gold">{miles(l.cierre)}</dd>
                  </div>
                </dl>
              </Link>
            ))}
            {lugares.length === 0 && (
              <p className="text-sm text-brand-cream/70">No hay sucursales registradas.</p>
            )}
          </section>
        )}

        {lugar && (
          <>
            {/* Cuadre del día */}
            <section className="rounded-2xl border border-white/10 bg-brand-gray2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-brand-cream">Cuadre del día · {lugar.nombre}</h2>
                <a
                  href={csvHref}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs text-brand-cream/80 hover:border-brand-gold hover:text-brand-gold"
                >
                  Exportar este día (CSV)
                </a>
              </div>
              <div className="mt-3 flex flex-wrap items-stretch gap-2 text-center">
                <div className="min-w-24 flex-1 rounded-xl bg-brand-black px-3 py-2">
                  <p className="text-xs text-brand-cream/70">Al empezar el día</p>
                  <p className="text-xl font-semibold text-brand-cream">{miles(lugar.inicio)}</p>
                </div>
                {cuadre.map((c) => (
                  <div
                    key={c.etiqueta}
                    className={`min-w-24 flex-1 rounded-xl bg-brand-black px-3 py-2 ${c.valor === 0 ? "opacity-40" : ""}`}
                  >
                    <p className="text-xs text-brand-cream/70">{c.etiqueta}</p>
                    <p
                      className={`text-xl font-semibold ${
                        c.valor > 0 ? "text-brand-green" : c.valor < 0 ? "text-brand-red" : "text-brand-cream"
                      }`}
                    >
                      {signo(c.valor)}
                    </p>
                  </div>
                ))}
                <div className="min-w-24 flex-1 rounded-xl border border-brand-gold/40 bg-brand-black px-3 py-2">
                  <p className="text-xs text-brand-cream/70">{esHoy ? "Existencia ahora" : "Al cerrar el día"}</p>
                  <p className="text-xl font-semibold text-brand-gold">{miles(lugar.cierre)}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-brand-cream/70">
                Inicio + entradas − salidas = existencia. Cuenta las piezas físicas y compáralas con este número.
              </p>
            </section>

            {/* Para revisar */}
            {(aRevisar.length > 0 || preciosNegativos.length > 0) && (
              <section className="rounded-2xl border border-brand-red/40 bg-brand-red/5 p-4">
                <h2 className="text-base font-semibold text-brand-red">Por revisar</h2>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-brand-cream/90">
                  {preciosNegativos.map((p) => (
                    <li key={p.lote_id}>
                      El precio ${Number(p.precio_mxn).toLocaleString("es-MX")} tiene existencia negativa (
                      {miles(p.actual)}): se registró más salida que entrada.
                    </li>
                  ))}
                  {aRevisar.map((l) => (
                    <li key={l.clave}>
                      {formatearHora(l.hora)} · <strong>{etiquetaTipo(l.tipo)}</strong> {l.detalle} ({signo(l.piezas)})
                      por {l.usuario}
                      {l.nota ? ` — “${l.nota}”` : " — sin nota"}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Ventas de los vendedores */}
            <section className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-brand-cream">Ventas (vendedores)</h2>
              {resumenVendedores.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {resumenVendedores.map((v) => (
                    <span key={v.nombre} className="rounded-full bg-brand-gray2 px-3 py-1 text-xs text-brand-cream/80">
                      {v.nombre}: <strong className="text-brand-gold">{miles(v.piezas)} piezas</strong> en {v.ventas}{" "}
                      {v.ventas === 1 ? "venta" : "ventas"}
                    </span>
                  ))}
                </div>
              )}
              <TablaLineas filas={lineasVenta} vacio={`Sin ventas este día en ${lugar.nombre}.`} />
            </section>

            {/* Movimientos de inventario (administración) */}
            <section className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-brand-cream">
                Movimientos de inventario (entradas, traspasos, ajustes, salidas)
              </h2>
              <TablaLineas
                filas={lineasInventario}
                vacio={`Sin movimientos de inventario este día en ${lugar.nombre}.`}
              />
            </section>

            {/* Por precio: primero los que se movieron; el resto, plegado */}
            <section className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-brand-cream">Existencia por precio</h2>
              <TablaPrecios filas={preciosMovidos} esHoy={esHoy} vacio="Ningún precio tuvo movimiento este día." />
              {preciosQuietos.length > 0 && (
                <details className="rounded-2xl border border-white/10">
                  <summary className="cursor-pointer px-4 py-2 text-sm text-brand-cream/70">
                    Ver los otros {preciosQuietos.length} precios (sin movimiento este día)
                  </summary>
                  <TablaPrecios filas={preciosQuietos} esHoy={esHoy} />
                </details>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
