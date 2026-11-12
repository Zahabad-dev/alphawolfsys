import { formatearHora } from "@/lib/fechas";
import { miles } from "@/lib/formato";
import { etiquetaTipo, type Linea } from "@/lib/historial";

/** Piezas con signo explícito: +120, −15 (el menos ya viene en el número). */
export const signo = (n: number) => (n > 0 ? `+${miles(n)}` : miles(n));

const CLASE_TIPO: Record<string, string> = {
  venta: "bg-brand-gold/15 text-brand-gold",
  entrada: "bg-brand-green/15 text-brand-green",
  corte: "bg-brand-green/15 text-brand-green",
  ajuste: "bg-yellow-500/15 text-yellow-500",
  traspaso_salida: "bg-white/10 text-brand-cream/80",
  traspaso_entrada: "bg-white/10 text-brand-cream/80",
  salida: "bg-brand-red/15 text-brand-red",
};

/** Marca de "por revisar": el punto es decorativo y el texto oculto lo anuncia a lectores de pantalla. */
export function MarcaRevisar() {
  return (
    <>
      <span aria-hidden="true" className="ml-1 text-brand-red">
        ●
      </span>
      <span className="sr-only"> (por revisar)</span>
    </>
  );
}

export interface FilaPrecio {
  lote_id: number;
  precio_mxn: string;
  activo: boolean;
  inicio: number;
  entro: number;
  salio: number;
  cierre: number;
  actual: number;
}

/** Bitácora: una línea por venta o por movimiento, con la existencia que quedó después. */
export function TablaLineas({ filas, vacio }: { filas: Linea[]; vacio: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-brand-gray2 text-brand-cream/70">
          <tr>
            <th scope="col" className="px-4 py-2">Hora</th>
            <th scope="col" className="px-4 py-2">Qué</th>
            <th scope="col" className="px-4 py-2">Detalle</th>
            <th scope="col" className="px-4 py-2 text-right">Piezas</th>
            <th scope="col" className="px-4 py-2">Quién</th>
            <th scope="col" className="px-4 py-2">Nota</th>
            <th scope="col" className="px-4 py-2 text-right" title="Piezas que quedaban en la sucursal después de este movimiento">
              Quedan (total)
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((l) => (
            <tr key={l.clave} className="border-t border-white/10">
              <td className="whitespace-nowrap px-4 py-2 text-brand-cream/70">{formatearHora(l.hora)}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${CLASE_TIPO[l.tipo] ?? "bg-white/10 text-brand-cream/80"}`}>
                  {etiquetaTipo(l.tipo)}
                </span>
                {l.revisar && <MarcaRevisar />}
              </td>
              <td className="px-4 py-2">{l.detalle}</td>
              <td className={`px-4 py-2 text-right ${l.piezas < 0 ? "text-brand-red" : "text-brand-green"}`}>
                {signo(l.piezas)}
              </td>
              <td className="px-4 py-2">{l.usuario}</td>
              <td className="px-4 py-2 text-brand-cream/70">{l.nota}</td>
              <td className="px-4 py-2 text-right font-semibold">{miles(l.existencia)}</td>
            </tr>
          ))}
          {filas.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-brand-cream/70">
                {vacio}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Existencia por precio del día: al empezar, lo que entró y salió, y cómo quedó. */
export function TablaPrecios({
  filas,
  esHoy,
  vacio,
}: {
  filas: FilaPrecio[];
  esHoy: boolean;
  /** Texto cuando no hay filas; si va vacío, no se dibuja renglón. */
  vacio?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-brand-gray2 text-brand-cream/70">
          <tr>
            <th scope="col" className="px-4 py-2">Precio</th>
            <th scope="col" className="px-4 py-2 text-right">Al empezar</th>
            <th scope="col" className="px-4 py-2 text-right">Entró</th>
            <th scope="col" className="px-4 py-2 text-right">Salió</th>
            <th scope="col" className="px-4 py-2 text-right">{esHoy ? "Ahora" : "Al cerrar"}</th>
            {!esHoy && <th scope="col" className="px-4 py-2 text-right">Hoy hay</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((p) => (
            <tr key={p.lote_id} className="border-t border-white/10">
              <td className="px-4 py-2 font-semibold text-brand-gold">
                ${Number(p.precio_mxn).toLocaleString("es-MX")}
                {!p.activo && <span className="ml-2 text-xs font-normal text-brand-cream/70">inactivo</span>}
              </td>
              <td className="px-4 py-2 text-right">{miles(p.inicio)}</td>
              <td className="px-4 py-2 text-right text-brand-green">{p.entro ? signo(p.entro) : "—"}</td>
              <td className="px-4 py-2 text-right text-brand-red">{p.salio ? signo(p.salio) : "—"}</td>
              <td className={`px-4 py-2 text-right font-semibold ${p.cierre < 0 ? "text-brand-red" : ""}`}>
                {miles(p.cierre)}
              </td>
              {!esHoy && <td className="px-4 py-2 text-right text-brand-cream/70">{miles(p.actual)}</td>}
            </tr>
          ))}
          {filas.length === 0 && vacio && (
            <tr>
              <td colSpan={esHoy ? 5 : 6} className="px-4 py-6 text-center text-brand-cream/70">
                {vacio}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
