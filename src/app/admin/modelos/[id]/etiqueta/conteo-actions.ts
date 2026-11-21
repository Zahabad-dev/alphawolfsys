"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query, withTransaction } from "@/lib/db";
import { puedeGestionar } from "@/lib/permisos";
import { enteroPositivo } from "@/lib/historial";
import type { Rol } from "@/types/next-auth";

export interface ConteoResult {
  error?: string;
  success?: string;
  /** true si se registró (para limpiar el formulario). */
  registrado?: boolean;
}

const NOTA_MAX = 200;

class ErrorConteo extends Error {}
const PIEZAS_MAX = 10000;

/**
 * Registra cuántas piezas de un modelo se etiquetaron (o una corrección, que puede restar). Control interno:
 * no toca el inventario por precio. Lo hacen la administración y la gerente (los mismos que manejan Precios).
 */
export async function registrarEtiquetadoAction(_prev: ConteoResult | undefined, formData: FormData): Promise<ConteoResult> {
  const session = await auth();
  if (!session || !puedeGestionar(session.user.rol)) return { error: "No tienes permiso para registrar piezas." };
  const yo = Number(session.user.id);
  const { rows: u } = await query<{ rol: Rol; activo: boolean }>("SELECT rol, activo FROM usuarios WHERE id = $1", [yo]);
  if (!u[0]?.activo || !puedeGestionar(u[0].rol)) return { error: "No tienes permiso para registrar piezas." };

  const modeloId = enteroPositivo(String(formData.get("modelo_id") ?? ""));
  const sucursalId = enteroPositivo(String(formData.get("sucursal_id") ?? ""));
  const correccion = formData.get("correccion") === "1";
  // Sumar también las piezas al inventario del precio del modelo en esa sucursal (una sola captura).
  const sumarInventario = !correccion && formData.get("sumar_inventario") === "1";
  const texto = String(formData.get("piezas") ?? "").trim();
  const nota = String(formData.get("nota") ?? "").replace(/\s+/g, " ").trim();
  const intento = String(formData.get("intento") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(intento)) {
    return { error: "Recarga la página e inténtalo de nuevo." };
  }
  if (!modeloId || !sucursalId) return { error: "Datos no válidos. Recarga la página." };
  if (!(correccion ? /^-?[1-9]\d{0,4}$/ : /^[1-9]\d{0,4}$/).test(texto)) {
    return { error: correccion ? "Escribe cuántas piezas sumar o restar (ej. 3 o -3)." : "Escribe cuántas piezas etiquetaste." };
  }
  const piezas = Number(texto);
  if (Math.abs(piezas) > PIEZAS_MAX) return { error: `Máximo ${PIEZAS_MAX} piezas por registro.` };
  if (correccion && !nota) return { error: "En una corrección escribe el motivo." };
  if (nota.length > NOTA_MAX) return { error: `La nota lleva máximo ${NOTA_MAX} caracteres.` };

  let precioInventario: string | null = null;
  try {
    precioInventario = await withTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO entradas_modelo (modelo_id, sucursal_id, tipo, piezas, nota, registrado_por, intento)
         SELECT m.id, s.id, $3, $4, $5, $6, $7 FROM modelos m, sucursales s
          WHERE m.id = $1 AND s.id = $2 AND s.activa
         ON CONFLICT (intento) DO NOTHING`,
        [modeloId, sucursalId, correccion ? "correccion" : "etiquetado", piezas, nota || null, yo, intento]
      );
      if (!r.rowCount) {
        // Ya estaba registrado este mismo intento (doble clic o reintento): no se cuenta doble (ni en inventario).
        const { rows } = await client.query("SELECT 1 FROM entradas_modelo WHERE intento = $1", [intento]);
        if (!rows.length) throw new ErrorConteo("El modelo o la sucursal ya no existen. Recarga la página.");
        return null;
      }
      if (!sumarInventario) return null;

      // Precio del modelo en esa sucursal (o el del Almacén), igual que en la venta.
      const { rows: pr } = await client.query<{ precio_mxn: string; nombre: string }>(
        `SELECT pm.precio_mxn, m.nombre FROM modelos m
           JOIN precios_modelo pm ON pm.modelo_id = m.id AND pm.vigente_hasta IS NULL
           JOIN sucursales s ON s.id = pm.sucursal_id
          WHERE m.id = $1 AND (pm.sucursal_id = $2 OR s.tipo = 'almacen')
          ORDER BY (pm.sucursal_id = $2) DESC LIMIT 1`,
        [modeloId, sucursalId]
      );
      if (!pr[0]) throw new ErrorConteo("Este modelo no tiene precio en esa sucursal ni en el Almacén: ponle precio primero (no se registró nada).");
      let { rows: lote } = await client.query<{ id: number; activo: boolean }>(
        "SELECT id, activo FROM lotes WHERE sucursal_id = $1 AND precio_mxn = $2 ORDER BY activo DESC, id LIMIT 1",
        [sucursalId, pr[0].precio_mxn]
      );
      if (lote[0] && !lote[0].activo) {
        throw new ErrorConteo(`Esa sucursal tiene $${Number(pr[0].precio_mxn).toFixed(2)} desactivado en Precios. Actívalo primero (no se registró nada).`);
      }
      if (!lote[0]) {
        ({ rows: lote } = await client.query<{ id: number; activo: boolean }>(
          "INSERT INTO lotes (nombre, precio_mxn, sucursal_id) VALUES ($1, $2, $3) RETURNING id, activo",
          [`$${Number(pr[0].precio_mxn).toFixed(2)}`, pr[0].precio_mxn, sucursalId]
        ));
      }
      await client.query(
        `INSERT INTO movimientos_inventario (lote_id, sucursal_id, tipo, cantidad, usuario_id, nota, modelo_id)
         VALUES ($1, $2, 'entrada', $3, $4, $5, $6)`,
        [lote[0].id, sucursalId, piezas, yo, `Entrada por modelo: ${pr[0].nombre}${nota ? ` — ${nota}` : ""}`.slice(0, 500), modeloId]
      );
      return pr[0].precio_mxn;
    });
  } catch (err) {
    if (err instanceof ErrorConteo) return { error: err.message };
    if ((err as { code?: string }).code === "42P01") return { error: "Falta preparar la base de datos (migración 016)." };
    throw err;
  }
  if (precioInventario) {
    revalidatePath("/admin/inventario");
    revalidatePath("/admin/historial");
    revalidatePath("/admin/corte");
  }
  revalidatePath(`/admin/modelos/${modeloId}/etiqueta`);
  revalidatePath("/admin/modelos");
  const n = Math.abs(piezas);
  return {
    success: correccion
      ? `Corrección registrada: ${piezas > 0 ? "+" : "−"}${n} ${n === 1 ? "pieza" : "piezas"}.`
      : `Entrada registrada: ${n} ${n === 1 ? "pieza" : "piezas"}` +
        (precioInventario ? ` y sumadas al inventario de $${Number(precioInventario).toFixed(2)}.` : "."),
    registrado: true,
  };
}
