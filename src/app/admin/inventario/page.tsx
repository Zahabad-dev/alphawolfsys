import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { dinero, dineroEntero, miles } from "@/lib/formato";
import { INVENTARIO_MUESTRA_DINERO } from "@/lib/funciones";
import { esAdmin } from "@/lib/permisos";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import EntradaForm from "./entrada-form";
import UmbralForm from "./umbral-form";
import AjusteForm from "./ajuste-form";

interface StockRow {
  lote_id: number;
  nombre: string;
  precio_mxn: string;
  stock: number;
  activo: boolean;
  umbral_stock: number;
  sucursal_id: number;
  sucursal_clave: string;
  sucursal_nombre: string;
  sucursal_tipo: string;
}

type Estado = "ok" | "bajo" | "sin-stock" | "inactivo";

interface Fila {
  loteId: number;
  precio: number;
  stock: number;
  umbral: number;
  valor: number;
  estado: Estado;
}

interface Lugar {
  id: number;
  clave: string;
  nombre: string;
  esAlmacen: boolean;
  filas: Fila[];
  piezas: number;
  valor: number;
  conStock: number;
  bajos: number;
  sinStock: number;
}

const FILTROS_ESTADO = [
  { valor: "", etiqueta: "Todos los estados" },
  { valor: "alerta", etiqueta: "Con alerta (stock bajo)" },
  { valor: "cero", etiqueta: "Sin stock" },
  { valor: "stock", etiqueta: "Con stock" },
] as const;

const CHIP: Record<Estado, { texto: string; clase: string }> = {
  ok: { texto: "Normal", clase: "bg-brand-green/15 text-brand-green" },
  bajo: { texto: "Stock bajo", clase: "bg-yellow-500/15 text-yellow-500" },
  "sin-stock": { texto: "Sin stock", clase: "bg-brand-red/15 text-brand-red" },
  inactivo: { texto: "Inactivo", clase: "bg-white/10 text-brand-cream/60" },
};

function estadoDe(r: StockRow): Estado {
  if (!r.activo) return "inactivo";
  if (r.stock <= 0) return "sin-stock";
  if (r.stock <= r.umbral_stock) return "bajo";
  return "ok";
}

function parametro(sp: { [key: string]: string | string[] | undefined }, clave: string): string {
  const v = sp[clave];
  return typeof v === "string" ? v : "";
}

export default async function AdminInventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") redirect("/login");

  // El dinero (valor del inventario a precio de lista) solo lo ve el administrador, y solo si
  // INVENTARIO_MUESTRA_DINERO está activo (src/lib/funciones.ts). El panel puede estar abierto
  // en una tablet o equipo compartido, así que para los demás roles ni se dibuja.
  const verDinero = INVENTARIO_MUESTRA_DINERO && esAdmin(session.user.rol);

  const sp = await searchParams;
  const sucursalSel = Number(parametro(sp, "sucursal")) || 0;
  const estadoSel = FILTROS_ESTADO.some((f) => f.valor === parametro(sp, "estado"))
    ? parametro(sp, "estado")
    : "";
  const q = parametro(sp, "q").trim();
  // Botón "Ajustar" de un renglón: abre el formulario de ajuste con ese lugar y precio elegidos.
  const ajustarSel = Number(parametro(sp, "ajustar")) || 0;
  const puedeAjustar = esAdmin(session.user.rol);

  const { rows: crudas } = await query<StockRow>(
    `SELECT sa.lote_id, sa.nombre, sa.precio_mxn, sa.stock, l.activo, l.umbral_stock,
            s.id AS sucursal_id, s.clave AS sucursal_clave, s.nombre AS sucursal_nombre, s.tipo AS sucursal_tipo
     FROM stock_actual sa
     JOIN sucursales s ON s.id = sa.sucursal_id
     JOIN lotes l ON l.id = sa.lote_id
     ORDER BY (s.tipo = 'almacen') DESC, s.nombre, sa.precio_mxn`
  );
  // La vista suma con bigint y el driver lo devuelve como TEXTO: se convierte a número
  // aquí, una sola vez, para que las sumas de abajo sean sumas y no concatenaciones.
  const rows = crudas.map((r) => ({ ...r, stock: Number(r.stock) }));

  // Se agrupa por lugar. Los totales de cada lugar y los de arriba son SIEMPRE del
  // inventario completo; los filtros solo deciden qué renglones se listan abajo.
  const lugares = new Map<number, Lugar>();
  for (const r of rows) {
    let lugar = lugares.get(r.sucursal_id);
    if (!lugar) {
      lugar = {
        id: r.sucursal_id,
        clave: r.sucursal_clave,
        nombre: r.sucursal_nombre,
        esAlmacen: r.sucursal_tipo === "almacen",
        filas: [],
        piezas: 0,
        valor: 0,
        conStock: 0,
        bajos: 0,
        sinStock: 0,
      };
      lugares.set(r.sucursal_id, lugar);
    }
    const precio = Number(r.precio_mxn);
    const estado = estadoDe(r);
    lugar.filas.push({
      loteId: r.lote_id,
      precio,
      stock: r.stock,
      umbral: r.umbral_stock,
      valor: r.stock * precio,
      estado,
    });
    lugar.piezas += r.stock;
    lugar.valor += r.stock * precio;
    if (r.stock > 0) lugar.conStock += 1;
    if (estado === "bajo") lugar.bajos += 1;
    if (estado === "sin-stock") lugar.sinStock += 1;
  }
  const todos = [...lugares.values()];

  const total = todos.reduce(
    (t, l) => ({
      piezas: t.piezas + l.piezas,
      valor: t.valor + l.valor,
      bajos: t.bajos + l.bajos,
      sinStock: t.sinStock + l.sinStock,
    }),
    { piezas: 0, valor: 0, bajos: 0, sinStock: 0 }
  );

  // Filtros de la lista de abajo.
  const coincide = (f: Fila): boolean => {
    if (q && !f.precio.toFixed(2).includes(q.replace(/^\$/, ""))) return false;
    if (estadoSel === "alerta") return f.estado === "bajo";
    if (estadoSel === "cero") return f.estado === "sin-stock";
    if (estadoSel === "stock") return f.stock > 0;
    return true;
  };
  const hayFiltroFilas = q !== "" || estadoSel !== "";
  const visibles = todos
    .filter((l) => !sucursalSel || l.id === sucursalSel)
    .map((l) => ({ lugar: l, filas: l.filas.filter(coincide) }))
    .filter((v) => v.filas.length > 0 || (!hayFiltroFilas && sucursalSel === v.lugar.id));

  const href = (cambios: { sucursal?: number | null }) => {
    const p = new URLSearchParams();
    const suc = cambios.sucursal === undefined ? sucursalSel : cambios.sucursal;
    if (suc) p.set("sucursal", String(suc));
    if (estadoSel) p.set("estado", estadoSel);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/admin/inventario?${s}` : "/admin/inventario";
  };

  const hrefAjustar = (loteId: number) => {
    const p = new URLSearchParams();
    if (sucursalSel) p.set("sucursal", String(sucursalSel));
    if (estadoSel) p.set("estado", estadoSel);
    if (q) p.set("q", q);
    p.set("ajustar", String(loteId));
    return `/admin/inventario?${p.toString()}#ajuste`;
  };

  const lotesAjuste = rows.map((r) => ({
    id: r.lote_id,
    etiqueta: `${r.sucursal_nombre} — ${dinero(Number(r.precio_mxn))} (stock ${miles(r.stock)})`,
  }));

  const lotesParaForm = rows.map((r) => ({
    id: r.lote_id,
    etiqueta: `${r.sucursal_nombre} — ${dinero(Number(r.precio_mxn))}`,
  }));
  const exportHref = sucursalSel
    ? `/admin/export/inventario?sucursal_id=${sucursalSel}`
    : "/admin/export/inventario";

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Inventario" subtitulo="Por sucursal" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        {/* Resumen general */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metrica etiqueta="Piezas en total" valor={miles(total.piezas)} />
          {verDinero ? (
            <Metrica etiqueta="Valor a precio de lista" valor={dineroEntero(total.valor)} />
          ) : (
            <Metrica etiqueta="Lugares" valor={miles(todos.length)} />
          )}
          <Metrica
            etiqueta="Precios con stock bajo"
            valor={miles(total.bajos)}
            tono={total.bajos > 0 ? "alerta" : undefined}
          />
          <Metrica
            etiqueta="Precios sin stock"
            valor={miles(total.sinStock)}
            tono={total.sinStock > 0 ? "peligro" : undefined}
          />
        </section>

        {/* Selector de lugar: una tarjeta por sucursal, con su resumen */}
        <section>
          <p className="mb-2 text-sm text-brand-cream/70">Elige un lugar para verlo completo</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TarjetaLugar
              href={href({ sucursal: null })}
              activa={!sucursalSel}
              titulo="Todos los lugares"
              clave={`${todos.length} lugares`}
              piezas={total.piezas}
              valor={verDinero ? total.valor : null}
              bajos={total.bajos}
              sinStock={total.sinStock}
            />
            {todos.map((l) => (
              <TarjetaLugar
                key={l.id}
                href={href({ sucursal: l.id })}
                activa={sucursalSel === l.id}
                titulo={l.nombre}
                clave={l.esAlmacen ? `${l.clave} · Almacén` : l.clave}
                piezas={l.piezas}
                valor={verDinero ? l.valor : null}
                bajos={l.bajos}
                sinStock={l.sinStock}
              />
            ))}
          </div>
        </section>

        {/* Filtros y acciones */}
        <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            {sucursalSel ? <input type="hidden" name="sucursal" value={sucursalSel} /> : null}
            <label className="flex flex-col gap-1 text-xs text-brand-cream/60">
              Buscar precio
              <input
                name="q"
                type="text"
                inputMode="decimal"
                defaultValue={q}
                placeholder="ej. 140"
                className="w-32 rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream outline-none focus:border-brand-gold"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-brand-cream/60">
              Estado
              <select
                name="estado"
                defaultValue={estadoSel}
                className="rounded-lg border border-white/10 bg-brand-black px-2 py-1 text-sm text-brand-cream"
              >
                {FILTROS_ESTADO.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-full bg-brand-gold px-4 py-1.5 text-sm font-semibold text-brand-black"
            >
              Filtrar
            </button>
            {(q || estadoSel) && (
              <a
                href={href({}).split("?")[0] + (sucursalSel ? `?sucursal=${sucursalSel}` : "")}
                className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-brand-cream/70 hover:border-brand-gold hover:text-brand-gold"
              >
                Limpiar filtros
              </a>
            )}
            <a
              href={exportHref}
              className="ml-auto rounded-full border border-white/10 px-4 py-1.5 text-sm text-brand-cream/80 hover:border-brand-gold hover:text-brand-gold"
            >
              {sucursalSel ? "Exportar este lugar (CSV)" : "Exportar todo (CSV)"}
            </a>
          </form>

          <details className="rounded-xl border border-white/10 bg-brand-black/40 px-3 py-2">
            <summary className="cursor-pointer text-sm text-brand-cream/80">
              Registrar una entrada de piezas
            </summary>
            <div className="mt-3">
              <EntradaForm lotes={lotesParaForm} />
            </div>
          </details>

          {puedeAjustar && (
            <AjusteForm
              key={ajustarSel}
              lotes={lotesAjuste}
              loteInicial={ajustarSel || undefined}
            />
          )}
        </section>

        {/* Detalle por lugar */}
        {visibles.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-brand-gray2 p-6 text-center text-sm text-brand-cream/50">
            Ningún precio coincide con los filtros.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {visibles.map(({ lugar, filas }) => (
              <details
                key={lugar.id}
                // Con un lugar elegido (o filtros activos) se muestra abierto; en la vista general, cerrado.
                open={sucursalSel === lugar.id || hayFiltroFilas || visibles.length === 1}
                className="rounded-2xl border border-white/10 bg-brand-gray2"
              >
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-brand-cream/60">
                    {lugar.clave}
                  </span>
                  <span className="font-semibold text-brand-cream">{lugar.nombre}</span>
                  {lugar.esAlmacen && (
                    <span className="rounded-full bg-brand-gold/20 px-3 py-1 text-xs text-brand-gold">
                      Almacén
                    </span>
                  )}
                  <span className="ml-auto text-sm text-brand-cream/70">
                    {miles(lugar.piezas)} pzs{verDinero ? ` · ${dineroEntero(lugar.valor)}` : ""}
                  </span>
                  {lugar.bajos > 0 && (
                    <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs text-yellow-500">
                      {lugar.bajos} bajo{lugar.bajos > 1 ? "s" : ""}
                    </span>
                  )}
                  {lugar.sinStock > 0 && (
                    <span className="rounded-full bg-brand-red/15 px-2 py-0.5 text-xs text-brand-red">
                      {lugar.sinStock} sin stock
                    </span>
                  )}
                </summary>

                <div className="overflow-x-auto border-t border-white/10">
                  <table className="w-full text-left text-sm">
                    <thead className="text-brand-cream/70">
                      <tr>
                        <th className="px-4 py-2">Precio</th>
                        <th className="px-4 py-2">Stock</th>
                        {verDinero && <th className="px-4 py-2">Valor</th>}
                        <th className="px-4 py-2">Estado</th>
                        <th className="px-4 py-2">Mínimo (alerta)</th>
                        {puedeAjustar && <th className="px-4 py-2">Ajuste</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f) => (
                        <tr
                          key={f.loteId}
                          className={`border-t border-white/10 ${f.estado === "inactivo" ? "opacity-60" : ""}`}
                        >
                          <td className="px-4 py-2 font-semibold">{dinero(f.precio)}</td>
                          <td
                            className={`px-4 py-2 ${
                              f.estado === "sin-stock"
                                ? "text-brand-red"
                                : f.estado === "bajo"
                                  ? "text-yellow-500"
                                  : ""
                            }`}
                          >
                            {miles(f.stock)}
                          </td>
                          {verDinero && (
                            <td className="px-4 py-2 text-brand-cream/70">{dinero(f.valor)}</td>
                          )}
                          <td className="px-4 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs ${CHIP[f.estado].clase}`}>
                              {CHIP[f.estado].texto}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <UmbralForm id={f.loteId} umbralActual={f.umbral} />
                          </td>
                          {puedeAjustar && (
                            <td className="px-4 py-2">
                              <a
                                href={hrefAjustar(f.loteId)}
                                className="text-sm text-brand-cream/70 underline hover:text-brand-gold"
                              >
                                Ajustar
                              </a>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10 text-brand-cream/80">
                        <td className="px-4 py-2 font-semibold">
                          {hayFiltroFilas ? "Lo que se ve" : "Total"}
                        </td>
                        <td className="px-4 py-2 font-semibold">
                          {miles(filas.reduce((s, f) => s + f.stock, 0))}
                        </td>
                        {verDinero && (
                          <td className="px-4 py-2 font-semibold text-brand-gold">
                            {dinero(filas.reduce((s, f) => s + f.valor, 0))}
                          </td>
                        )}
                        <td colSpan={puedeAjustar ? 3 : 2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </details>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Metrica({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string;
  valor: string;
  tono?: "alerta" | "peligro";
}) {
  const color =
    tono === "peligro" ? "text-brand-red" : tono === "alerta" ? "text-yellow-500" : "text-brand-gold";
  return (
    <div className="rounded-2xl border border-white/10 bg-brand-gray2 p-4">
      <p className="text-xs text-brand-cream/60">{etiqueta}</p>
      <p className={`mt-1 text-xl font-bold sm:text-2xl ${color}`}>{valor}</p>
    </div>
  );
}

function TarjetaLugar({
  href,
  activa,
  titulo,
  clave,
  piezas,
  valor,
  bajos,
  sinStock,
}: {
  href: string;
  activa: boolean;
  titulo: string;
  clave: string;
  piezas: number;
  valor: number | null;
  bajos: number;
  sinStock: number;
}) {
  return (
    <a
      href={href}
      aria-current={activa ? "page" : undefined}
      className={`flex flex-col gap-1 rounded-2xl border p-4 transition-colors ${
        activa
          ? "border-brand-gold bg-brand-gold/10"
          : "border-white/10 bg-brand-gray2 hover:border-brand-gold/50"
      }`}
    >
      <span className="text-xs text-brand-cream/50">{clave}</span>
      <span className="font-semibold text-brand-cream">{titulo}</span>
      <span className="text-lg font-bold text-brand-gold">{miles(piezas)} pzs</span>
      {valor !== null && (
        <span className="text-xs text-brand-cream/70">{dineroEntero(valor)} a precio de lista</span>
      )}
      {(bajos > 0 || sinStock > 0) && (
        <span className="mt-1 flex flex-wrap gap-1.5">
          {bajos > 0 && (
            <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs text-yellow-500">
              {bajos} bajo{bajos > 1 ? "s" : ""}
            </span>
          )}
          {sinStock > 0 && (
            <span className="rounded-full bg-brand-red/15 px-2 py-0.5 text-xs text-brand-red">
              {sinStock} sin stock
            </span>
          )}
        </span>
      )}
    </a>
  );
}
