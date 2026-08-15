import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import TraspasoForm from "./traspaso-form";

interface LoteAlmacenRow {
  lote_id: number;
  nombre: string;
  precio_mxn: string;
  stock: number;
}

interface SucursalRow {
  id: number;
  nombre: string;
}

interface TraspasoRow {
  id: number;
  creado_en: string;
  tipo: string;
  cantidad: number;
  sucursal_nombre: string;
  lote_nombre: string;
  usuario_nombre: string;
  nota: string | null;
}

export default async function AdminTraspasosPage() {
  const session = await auth();
  if (!session || session.user.rol !== "admin") redirect("/login");

  const [{ rows: lotesAlmacen }, { rows: sucursales }, { rows: recientes }] = await Promise.all([
    query<LoteAlmacenRow>(
      `SELECT sa.lote_id, sa.nombre, sa.precio_mxn, sa.stock
       FROM stock_actual sa
       JOIN sucursales s ON s.id = sa.sucursal_id
       WHERE s.tipo = 'almacen'
       ORDER BY sa.precio_mxn`
    ),
    query<SucursalRow>(
      "SELECT id, nombre FROM sucursales WHERE tipo = 'sucursal' AND activa = true ORDER BY nombre"
    ),
    query<TraspasoRow>(
      `SELECT m.id, m.creado_en, m.tipo, m.cantidad, s.nombre AS sucursal_nombre,
              l.nombre AS lote_nombre, u.nombre AS usuario_nombre, m.nota
       FROM movimientos_inventario m
       JOIN sucursales s ON s.id = m.sucursal_id
       JOIN lotes l ON l.id = m.lote_id
       JOIN usuarios u ON u.id = m.usuario_id
       WHERE m.tipo IN ('traspaso_salida', 'traspaso_entrada')
       ORDER BY m.creado_en DESC
       LIMIT 40`
    ),
  ]);

  const lotesParaForm = lotesAlmacen.map((l) => ({
    id: l.lote_id,
    etiqueta: `${l.nombre} - $${Number(l.precio_mxn).toFixed(2)}`,
    stock: l.stock,
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Traspasos" subtitulo="Almacén Central → sucursales" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        {lotesParaForm.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-brand-gray2 p-4 text-sm text-brand-cream/70">
            El Almacén Central todavía no tiene lotes con stock. Registra un{" "}
            <a href="/admin/corte" className="text-brand-gold underline">
              corte
            </a>{" "}
            primero.
          </p>
        ) : (
          <TraspasoForm lotesAlmacen={lotesParaForm} sucursales={sucursales} />
        )}

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-gray2 text-brand-cream/70">
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Sucursal</th>
                <th className="px-4 py-2">Lote</th>
                <th className="px-4 py-2">Cantidad</th>
                <th className="px-4 py-2">Usuario</th>
                <th className="px-4 py-2">Nota</th>
              </tr>
            </thead>
            <tbody>
              {recientes.map((r) => (
                <tr key={r.id} className="border-t border-white/10">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {new Date(r.creado_en).toLocaleString("es-MX")}
                  </td>
                  <td className="px-4 py-2">
                    {r.tipo === "traspaso_salida" ? (
                      <span className="text-brand-red">Salida</span>
                    ) : (
                      <span className="text-brand-green">Entrada</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{r.sucursal_nombre}</td>
                  <td className="px-4 py-2">{r.lote_nombre}</td>
                  <td className="px-4 py-2">
                    {r.cantidad > 0 ? "+" : ""}
                    {r.cantidad}
                  </td>
                  <td className="px-4 py-2">{r.usuario_nombre}</td>
                  <td className="px-4 py-2 text-brand-cream/60">{r.nota ?? ""}</td>
                </tr>
              ))}
              {recientes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-brand-cream/50">
                    Sin traspasos todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
