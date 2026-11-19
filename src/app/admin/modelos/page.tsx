import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import { formatearFechaHora } from "@/lib/fechas";
import { esAdmin, puedeGestionar } from "@/lib/permisos";
import { enteroPositivo } from "@/lib/historial";
import { claveModelo, textoEtiquetaAuto } from "@/lib/modelos";
import { dinero } from "@/lib/formato";
import ModeloForm, { type Sugerencias, type TallaOpcion } from "./modelo-form";
import { EstadoModeloForm, NuevaTallaForm, TallaFila } from "./estado-form";

interface ModeloRow {
  id: number;
  nombre: string;
  nombre_base: string;
  variante: string | null;
  distintivo: string | null;
  color: string | null;
  texto_etiqueta: string | null;
  codigo: string | null;
  activo: boolean;
  descontinuado_en: Date | string | null;
  tallas: number[];
  precios: { clave: string; precio: string }[];
}

const FILTROS = [
  { valor: "activos", etiqueta: "Activos" },
  { valor: "descontinuados", etiqueta: "Descontinuados" },
  { valor: "todos", etiqueta: "Todos" },
] as const;

async function cargar() {
  const [{ rows: tallas }, { rows: modelos }] = await Promise.all([
    query<TallaOpcion>("SELECT id, nombre, activa FROM tallas ORDER BY orden, id"),
    query<ModeloRow>(
      `SELECT m.id, m.nombre, m.nombre_base, m.variante, m.distintivo, m.color, m.texto_etiqueta,
              m.codigo, m.activo, m.descontinuado_en,
              COALESCE(array_agg(mt.talla_id) FILTER (WHERE mt.talla_id IS NOT NULL), '{}') AS tallas,
              COALESCE((SELECT json_agg(json_build_object('clave', s.clave, 'precio', pm.precio_mxn::text)
                                        ORDER BY s.tipo = 'almacen' DESC, s.nombre)
                          FROM precios_modelo pm JOIN sucursales s ON s.id = pm.sucursal_id
                         WHERE pm.modelo_id = m.id AND pm.vigente_hasta IS NULL), '[]') AS precios
       FROM modelos m
       LEFT JOIN modelo_tallas mt ON mt.modelo_id = m.id
       GROUP BY m.id
       ORDER BY m.nombre_base, m.nombre`
    ),
  ]);
  return { tallas, modelos };
}

export default async function AdminModelosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") redirect("/login");
  const admin = esAdmin(session.user.rol);
  const puedeCambiarPrecios = puedeGestionar(session.user.rol);

  const sp = await searchParams;
  const texto = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = texto("q").trim();
  const filtro = FILTROS.some((f) => f.valor === texto("estado")) ? texto("estado") : "activos";
  const editarId = admin ? enteroPositivo(texto("editar")) : 0;

  let datos: Awaited<ReturnType<typeof cargar>>;
  try {
    datos = await cargar();
  } catch (err) {
    // 42P01 = la tabla no existe: faltan sql/014_catalogo_modelos.sql y sql/015_precios_modelo.sql en esta base.
    if ((err as { code?: string }).code !== "42P01") throw err;
    return (
      <div className="flex min-h-screen flex-col">
        <Header titulo="Modelos" subtitulo="Catálogo de prendas" />
        <AdminNav />
        <main className="p-4 sm:p-6">
          <p className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-brand-cream">
            Falta preparar la base de datos para esta pantalla (las migraciones <code>014_catalogo_modelos.sql</code> y{" "}
            <code>015_precios_modelo.sql</code>). Avisa a soporte; el resto del sistema no se ve afectado.
          </p>
        </main>
      </div>
    );
  }
  const { tallas, modelos } = datos;
  const nombreTalla = new Map(tallas.map((t) => [t.id, t.nombre]));
  const ordenTalla = new Map(tallas.map((t, i) => [t.id, i]));
  const catalogo = modelos.map((m) => ({ id: m.id, nombre: m.nombre }));
  const distintos = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
  const sugerencias: Sugerencias = {
    bases: distintos(modelos.map((m) => m.nombre_base)),
    variantes: distintos(["MC", "ML", ...modelos.map((m) => m.variante)]),
    distintivos: distintos(modelos.map((m) => m.distintivo)),
    colores: distintos(modelos.map((m) => m.color)),
  };
  const partes = (m: ModeloRow) => ({ base: m.nombre_base, variante: m.variante ?? "", distintivo: m.distintivo ?? "", color: m.color ?? "" });
  const textoEtiqueta = (m: ModeloRow) => m.texto_etiqueta ?? textoEtiquetaAuto(partes(m));
  const editando = editarId ? modelos.find((m) => m.id === editarId) : undefined;

  const activos = modelos.filter((m) => m.activo).length;
  // Búsqueda por palabras, en cualquier orden: "franela m/c" encuentra "CAMISA CUADRO FRANELA ADULTO M/C (ROJO)".
  const palabrasQ = claveModelo(q).split(" ").filter(Boolean);
  const coincide = (m: ModeloRow) => {
    if (!palabrasQ.length) return true;
    const clave = claveModelo(m.nombre);
    return palabrasQ.every((p) => clave.includes(p)) || (!!m.codigo && m.codigo.includes(q.toUpperCase().replace(/\s+/g, "-")));
  };
  const visibles = modelos.filter((m) => (filtro === "todos" || (filtro === "activos") === m.activo) && coincide(m));
  const url = (cambios: { estado?: string; q?: string; editar?: number }) => {
    const p = new URLSearchParams();
    const e = cambios.estado ?? filtro;
    const b = cambios.q ?? q;
    if (e !== "activos") p.set("estado", e);
    if (b) p.set("q", b);
    if (cambios.editar) p.set("editar", String(cambios.editar));
    const s = p.toString();
    return s ? `/admin/modelos?${s}` : "/admin/modelos";
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Modelos" subtitulo="Catálogo de prendas" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        {admin ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-brand-cream">
              {editando ? `Editar: ${editando.nombre}` : "Dar de alta un modelo o variante"}
            </h2>
            {editarId > 0 && !editando && (
              <p className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-brand-cream">
                Ese modelo ya no existe. Puedes dar de alta uno nuevo.
              </p>
            )}
            <p className="text-sm text-brand-cream/70">
              Cada alta es lo que lleva una etiqueta y un precio. Para la manga corta y la larga de un mismo modelo, escribe
              el mismo modelo y cambia la variante (MC, ML). Si unas tallas cuestan más, dalas de alta como otra variante
              (ej. ML 2XL-3XL).
            </p>
            <ModeloForm
              key={editando?.id ?? "nuevo"}
              tallas={tallas}
              catalogo={catalogo}
              sugerencias={sugerencias}
              volver={url({})}
              modelo={
                editando
                  ? {
                      id: editando.id,
                      nombre: editando.nombre,
                      ...partes(editando),
                      textoEtiqueta: editando.texto_etiqueta ?? "",
                      codigo: editando.codigo,
                      tallas: editando.tallas,
                    }
                  : undefined
              }
            />
          </section>
        ) : (
          <p className="rounded-2xl border border-white/10 p-4 text-sm text-brand-cream/70">
            Aquí puedes consultar los modelos. Darlos de alta, editarlos o descontinuarlos lo hace la administración.
          </p>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-base font-semibold text-brand-cream">
              Catálogo{" "}
              <span className="ml-1 text-sm font-normal text-brand-cream/70">
                {activos} activos · {modelos.length - activos} descontinuados
              </span>
            </h2>
            <form method="get" className="flex flex-wrap items-end gap-2">
              {filtro !== "activos" && <input type="hidden" name="estado" value={filtro} />}
              <label className="flex flex-col gap-1 text-xs text-brand-cream/70">
                Nombre o código
                <input
                  name="q"
                  type="search"
                  defaultValue={q}
                  placeholder="Ej. franela m/l"
                  className="w-56 rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-sm text-brand-cream outline-none focus:border-brand-gold"
                />
              </label>
              <button type="submit" className="rounded-full bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-black">
                Buscar
              </button>
            </form>
          </div>

          <nav aria-label="Estado de los modelos" className="flex flex-wrap gap-1">
            {FILTROS.map((f) => (
              <Link
                key={f.valor}
                href={url({ estado: f.valor })}
                aria-current={filtro === f.valor ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-sm ${
                  filtro === f.valor ? "bg-brand-gold font-semibold text-brand-black" : "text-brand-cream/70 hover:bg-brand-gray2"
                }`}
              >
                {f.etiqueta}
              </Link>
            ))}
          </nav>

          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-gray2 text-brand-cream/70">
                <tr>
                  <th scope="col" className="px-4 py-2">Modelo</th>
                  <th scope="col" className="px-4 py-2">Precios</th>
                  <th scope="col" className="px-4 py-2">Etiqueta</th>
                  <th scope="col" className="px-4 py-2">Tallas</th>
                  <th scope="col" className="px-4 py-2">Estado</th>
                  {admin && (
                    <th scope="col" className="px-4 py-2">
                      <span className="sr-only">Acciones</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visibles.map((m) => (
                  <tr key={m.id} className="border-t border-white/10 align-top">
                    <td className="px-4 py-2">
                      <span className="font-semibold text-brand-cream">{m.nombre}</span>
                      {m.codigo && <span className="block text-xs text-brand-cream/70">Código {m.codigo}</span>}
                    </td>
                    <td className="px-4 py-2">
                      {m.precios.length ? (
                        <span className="block text-xs text-brand-cream/90">
                          {m.precios.map((p) => `${p.clave} ${dinero(Number(p.precio))}`).join(" · ")}
                        </span>
                      ) : (
                        <span className="block text-xs text-brand-cream/70">sin precio</span>
                      )}
                      <Link
                        href={`/admin/modelos/${m.id}/precios`}
                        aria-label={`Precios de ${m.nombre}`}
                        className="text-xs text-brand-cream/70 underline hover:text-brand-gold"
                      >
                        {admin || puedeCambiarPrecios ? "Poner precios" : "Ver precios"}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <span className="block text-xs text-brand-cream/90">{textoEtiqueta(m)}</span>
                      <Link
                        href={`/admin/modelos/${m.id}/etiqueta`}
                        aria-label={`Ver etiqueta de ${m.nombre}`}
                        className="text-xs text-brand-cream/70 underline hover:text-brand-gold"
                      >
                        Ver etiqueta
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {[...m.tallas]
                          .sort((a, b) => (ordenTalla.get(a) ?? 99) - (ordenTalla.get(b) ?? 99))
                          .map((t) => (
                            <span key={t} className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-brand-cream/90">
                              {nombreTalla.get(t) ?? "?"}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {m.activo ? (
                        <span className="rounded-full bg-brand-green/15 px-2 py-0.5 text-xs text-brand-green">Activo</span>
                      ) : (
                        <>
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-brand-cream/80">Descontinuado</span>
                          {m.descontinuado_en && (
                            <span className="block text-xs text-brand-cream/70">desde {formatearFechaHora(m.descontinuado_en)}</span>
                          )}
                        </>
                      )}
                    </td>
                    {admin && (
                      <td className="whitespace-nowrap px-4 py-2">
                        <Link
                          href={url({ editar: m.id })}
                          aria-label={`Editar ${m.nombre}`}
                          className="mr-4 text-sm text-brand-cream/70 underline hover:text-brand-gold"
                        >
                          Editar
                        </Link>
                        <EstadoModeloForm id={m.id} nombre={m.nombre} activo={m.activo} />
                      </td>
                    )}
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={admin ? 6 : 5} className="px-4 py-6 text-center text-brand-cream/70">
                      {modelos.length === 0 ? "Todavía no hay modelos. Da de alta el primero arriba." : "Ningún modelo coincide con la búsqueda."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {admin && (
          <section className="flex flex-col gap-3 rounded-2xl border border-white/10 p-4">
            <h2 className="text-base font-semibold text-brand-cream">Tallas</h2>
            <p className="text-sm text-brand-cream/70">
              El orden de esta lista es el que se usa en todo el sistema (de chica a grande). Una talla desactivada ya no
              se ofrece para modelos nuevos, pero los que ya la tienen la conservan.
            </p>
            <ul className="max-w-xl">
              {tallas.map((t, i) => (
                <TallaFila key={t.id} id={t.id} nombre={t.nombre} activa={t.activa} primera={i === 0} ultima={i === tallas.length - 1} />
              ))}
            </ul>
            <NuevaTallaForm tallas={tallas.map((t) => ({ id: t.id, nombre: t.nombre }))} />
          </section>
        )}
      </main>
    </div>
  );
}
