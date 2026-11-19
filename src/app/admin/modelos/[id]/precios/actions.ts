"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query, withTransaction } from "@/lib/db";
import { puedeGestionar } from "@/lib/permisos";
import { enteroPositivo } from "@/lib/historial";
import { NOTA_PRECIO_MAX, leerPrecio } from "@/lib/modelos";
import { dinero } from "@/lib/formato";
import type { Rol } from "@/types/next-auth";

export interface PrecioModeloResult {
  error?: string;
  success?: string;
  /** true si de verdad cambió algo (para limpiar el formulario solo entonces). */
  cambio?: boolean;
}

/** Administración o gerente (los mismos que manejan Precios), leído de la base. Devuelve su id o null. */
async function gestionVigente(): Promise<number | null> {
  const session = await auth();
  if (!session || !puedeGestionar(session.user.rol)) return null;
  const { rows } = await query<{ rol: Rol; activo: boolean }>("SELECT rol, activo FROM usuarios WHERE id = $1", [
    Number(session.user.id),
  ]);
  return rows[0]?.activo && puedeGestionar(rows[0].rol) ? Number(session.user.id) : null;
}

function refrescar(modeloId: number) {
  revalidatePath(`/admin/modelos/${modeloId}/precios`);
  revalidatePath(`/admin/modelos/${modeloId}/etiqueta`);
  revalidatePath("/admin/modelos");
  revalidatePath("/admin/precios");
}

/**
 * Pone (o cambia) el precio del modelo en una o varias sucursales. No sobreescribe: cierra el precio vigente
 * y abre uno nuevo, para que quede el historial. Si en una sucursal ya tenía ese mismo precio, no hace nada ahí.
 */
export async function ponerPrecioModeloAction(
  _prev: PrecioModeloResult | undefined,
  formData: FormData
): Promise<PrecioModeloResult> {
  const yo = await gestionVigente();
  if (!yo) return { error: "No tienes permiso para cambiar precios." };
  const modeloId = enteroPositivo(String(formData.get("modelo_id") ?? ""));
  const precio = leerPrecio(String(formData.get("precio") ?? ""));
  // Ordenadas: dos cambios a la vez bloquean en el mismo orden (sin deadlock).
  const sucursales = [...new Set(formData.getAll("sucursal").map((s) => enteroPositivo(String(s))).filter(Boolean))].sort(
    (a, b) => a - b
  );
  const nota = String(formData.get("nota") ?? "").replace(/\s+/g, " ").trim();
  if (!modeloId) return { error: "Modelo no válido." };
  if (precio === null) return { error: "Escribe un precio válido (ej. 350 o 350.50)." };
  if (!sucursales.length) return { error: "Marca al menos una sucursal." };
  if (sucursales.length > 100) return { error: "Son demasiadas sucursales." };
  if (nota.length > NOTA_PRECIO_MAX) return { error: `La nota lleva máximo ${NOTA_PRECIO_MAX} caracteres.` };

  try {
    const cambiadas = await withTransaction(async (client) => {
      const { rows: modelo } = await client.query("SELECT id FROM modelos WHERE id = $1 FOR SHARE", [modeloId]);
      if (!modelo[0]) throw new Error("SIN_MODELO");
      const { rows: validas } = await client.query<{ id: number }>(
        "SELECT id FROM sucursales WHERE id = ANY($1::int[]) AND activa FOR SHARE",
        [sucursales]
      );
      if (validas.length !== sucursales.length) throw new Error("SUCURSAL_NO_VALIDA");

      // Se bloquean los precios vigentes para que dos cambios a la vez no se pisen.
      const { rows: vigentes } = await client.query<{ id: number; sucursal_id: number; precio_mxn: string }>(
        `SELECT id, sucursal_id, precio_mxn FROM precios_modelo
          WHERE modelo_id = $1 AND sucursal_id = ANY($2::int[]) AND vigente_hasta IS NULL
          FOR UPDATE`,
        [modeloId, sucursales]
      );
      const actual = new Map(vigentes.map((v) => [v.sucursal_id, v]));
      let n = 0;
      let lotesNuevos = 0;
      for (const s of sucursales) {
        const v = actual.get(s);
        if (v && Number(v.precio_mxn) === precio) continue;
        // La venta descuenta del lote (sucursal + precio). Si la sucursal no maneja ese precio en Precios,
        // se da de alta ahí mismo, como cuando se asigna desde Precios. Si existe pero desactivado, se avisa.
        const { rows: lotes } = await client.query<{ activo: boolean }>(
          "SELECT activo FROM lotes WHERE sucursal_id = $1 AND precio_mxn = $2 ORDER BY activo DESC LIMIT 1",
          [s, precio]
        );
        if (lotes[0] && !lotes[0].activo) throw new Error(`LOTE_INACTIVO:${s}`);
        if (!lotes[0]) {
          await client.query("INSERT INTO lotes (nombre, precio_mxn, sucursal_id) VALUES ($1, $2, $3)", [
            `$${precio.toFixed(2)}`,
            precio,
            s,
          ]);
          lotesNuevos++;
        }
        if (v) {
          await client.query("UPDATE precios_modelo SET vigente_hasta = clock_timestamp(), quitado_por = $2 WHERE id = $1", [
            v.id,
            yo,
          ]);
        }
        await client.query(
          `INSERT INTO precios_modelo (modelo_id, sucursal_id, precio_mxn, puesto_por, nota) VALUES ($1, $2, $3, $4, $5)`,
          [modeloId, s, precio, yo, nota || null]
        );
        n++;
      }
      return { n, lotesNuevos };
    });
    refrescar(modeloId);
    if (!cambiadas.n) return { success: "Esas sucursales ya tenían ese precio. No cambió nada." };
    const extra = cambiadas.lotesNuevos
      ? ` Se agregó ${dinero(precio)} en Precios de ${cambiadas.lotesNuevos === 1 ? "1 sucursal" : `${cambiadas.lotesNuevos} sucursales`} que no lo tenía.`
      : "";
    return {
      success: `Precio guardado en ${cambiadas.n} ${cambiadas.n === 1 ? "sucursal" : "sucursales"}.${extra}`,
      cambio: true,
    };
  } catch (err) {
    if (err instanceof Error && err.message === "SIN_MODELO") return { error: "Ese modelo ya no existe." };
    if (err instanceof Error && err.message === "SUCURSAL_NO_VALIDA")
      return { error: "Alguna sucursal ya no está activa. Recarga la página." };
    if (err instanceof Error && err.message.startsWith("LOTE_INACTIVO:")) {
      const { rows } = await query<{ nombre: string }>("SELECT nombre FROM sucursales WHERE id = $1", [
        Number(err.message.split(":")[1]),
      ]);
      return {
        error: `${rows[0]?.nombre ?? "Una sucursal"} tiene ${dinero(precio)} desactivado en Precios. Actívalo ahí primero (no se cambió nada).`,
      };
    }
    // 23505: otro cambio entró al mismo tiempo.
    if ((err as { code?: string }).code === "23505") return { error: "Alguien más cambió este precio al mismo tiempo. Recarga e inténtalo de nuevo." };
    throw err;
  }
}

/** Quita el precio del modelo en una sucursal (deja de venderse ahí). Queda en el historial. */
export async function quitarPrecioModeloAction(
  _prev: PrecioModeloResult | undefined,
  formData: FormData
): Promise<PrecioModeloResult> {
  const yo = await gestionVigente();
  if (!yo) return { error: "No tienes permiso para cambiar precios." };
  const modeloId = enteroPositivo(String(formData.get("modelo_id") ?? ""));
  const sucursalId = enteroPositivo(String(formData.get("sucursal_id") ?? ""));
  if (!modeloId || !sucursalId) return { error: "Datos no válidos." };
  const r = await query(
    `UPDATE precios_modelo SET vigente_hasta = clock_timestamp(), quitado_por = $3
      WHERE modelo_id = $1 AND sucursal_id = $2 AND vigente_hasta IS NULL`,
    [modeloId, sucursalId, yo]
  );
  refrescar(modeloId);
  if (!r.rowCount) return { error: "Esa sucursal ya no tenía precio." };
  return { success: "Precio quitado. Queda en el historial.", cambio: true };
}
