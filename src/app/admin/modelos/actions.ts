"use server";

import { revalidatePath } from "next/cache";
import type { PoolClient } from "pg";
import { auth } from "@/auth";
import { query, withTransaction } from "@/lib/db";
import { esAdmin } from "@/lib/permisos";
import { enteroPositivo } from "@/lib/historial";
import {
  NOMBRE_MODELO_MAX,
  TALLAS_POR_MODELO_MAX,
  claveModelo,
  codigoValido,
  limpiarCodigo,
  limpiarNombreModelo,
  limpiarTalla,
  modelosParecidos,
  nombreSuficiente,
  tallaValida,
} from "@/lib/modelos";
import type { Rol } from "@/types/next-auth";

export interface ModeloResult {
  error?: string;
  success?: string;
  /** Si hay modelos parecidos y no se confirmó, se devuelven para que la persona decida. */
  parecidos?: string[];
  /** El nombre con el que respondió el servidor (para no mostrar avisos viejos si luego se cambia). */
  nombreEnviado?: string;
}

/** La administración, leída de la base (la sesión guarda el rol por años). Devuelve su id o null. */
async function administracionVigente(): Promise<number | null> {
  const session = await auth();
  if (!session || !esAdmin(session.user.rol)) return null;
  const { rows } = await query<{ rol: Rol; activo: boolean }>("SELECT rol, activo FROM usuarios WHERE id = $1", [
    Number(session.user.id),
  ]);
  return rows[0]?.activo && esAdmin(rows[0].rol) ? Number(session.user.id) : null;
}

interface DatosModelo {
  nombre: string;
  clave: string;
  codigo: string | null;
  tallas: number[];
  confirmado: boolean;
}

function leerModelo(formData: FormData): { error: string } | DatosModelo {
  const nombre = limpiarNombreModelo(String(formData.get("nombre") ?? ""));
  const codigo = limpiarCodigo(String(formData.get("codigo") ?? ""));
  const tallas = [...new Set(formData.getAll("talla").map((t) => enteroPositivo(String(t))).filter(Boolean))];
  if (!nombreSuficiente(nombre)) return { error: "Escribe el nombre completo del modelo." };
  if (nombre.length > NOMBRE_MODELO_MAX) return { error: `El nombre es muy largo (máximo ${NOMBRE_MODELO_MAX} caracteres).` };
  if (!codigoValido(codigo)) return { error: "El código solo lleva letras, números y guiones (máximo 20)." };
  if (!tallas.length) return { error: "Marca al menos una talla que maneje el modelo." };
  if (tallas.length > TALLAS_POR_MODELO_MAX) return { error: "Son demasiadas tallas para un modelo." };
  return { nombre, clave: claveModelo(nombre), codigo: codigo || null, tallas, confirmado: formData.get("confirmado") === "1" };
}

/** Avisa si hay modelos que podrían ser el mismo y no se confirmó que es distinto. */
async function revisarParecidos(datos: DatosModelo, excluirId?: number): Promise<ModeloResult | null> {
  if (datos.confirmado) return null;
  const { rows } = await query<{ id: number; nombre: string }>("SELECT id, nombre FROM modelos");
  const parecidos = modelosParecidos(datos.nombre, rows, excluirId).map((m) => m.nombre);
  return parecidos.length
    ? {
        error: "Hay modelos con un nombre muy parecido. Revisa que no sea el mismo antes de guardarlo.",
        parecidos,
        nombreEnviado: datos.nombre,
      }
    : null;
}

function errorDeBase(err: unknown): string | null {
  const e = err as { code?: string; constraint?: string };
  if (e.code === "23505" && e.constraint?.includes("nombre_clave")) return "Ya existe un modelo con ese mismo nombre.";
  if (e.code === "23505" && e.constraint?.includes("codigo")) return "Ese código ya lo tiene otro modelo.";
  if (err instanceof Error && err.message === "TALLA_NO_DISPONIBLE") return "Alguna de las tallas ya no está disponible. Recarga la página.";
  if (e.code === "23503" && e.constraint?.includes("talla_id")) return "Alguna de las tallas ya no existe. Recarga la página.";
  if (e.code === "55P03") return "La lista de tallas está ocupada en este momento. Inténtalo de nuevo en unos segundos.";
  if (e.code === "23503" || e.code === "23514") return "No se pudo guardar con esos datos. Recarga la página e inténtalo de nuevo.";
  return null;
}

/**
 * Deja al modelo con exactamente esas tallas, agregando y quitando solo las que cambian (no se reescribe
 * todo: más adelante los precios y el inventario apuntarán a cada talla del modelo).
 */
async function guardarTallas(client: PoolClient, modeloId: number, tallas: number[]) {
  // Solo tallas que existen y están activas, o que el modelo ya tenía (una talla desactivada se conserva).
  const { rows } = await client.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM tallas
      WHERE id = ANY($1::int[])
        AND (activa OR id IN (SELECT talla_id FROM modelo_tallas WHERE modelo_id = $2))`,
    [tallas, modeloId]
  );
  if (rows[0].n !== tallas.length) throw new Error("TALLA_NO_DISPONIBLE");
  await client.query("DELETE FROM modelo_tallas WHERE modelo_id = $1 AND NOT (talla_id = ANY($2::int[]))", [modeloId, tallas]);
  await client.query(
    "INSERT INTO modelo_tallas (modelo_id, talla_id) SELECT $1::int, t FROM unnest($2::int[]) AS t ON CONFLICT DO NOTHING",
    [modeloId, tallas]
  );
}

/** Bloquea la lista de tallas para ordenarla, sin esperar indefinidamente si otra cosa la está usando. */
async function bloquearTallas(client: PoolClient) {
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("LOCK TABLE tallas IN SHARE ROW EXCLUSIVE MODE");
}

function refrescar() {
  revalidatePath("/admin/modelos");
}

export async function crearModeloAction(_prev: ModeloResult | undefined, formData: FormData): Promise<ModeloResult> {
  const yo = await administracionVigente();
  if (!yo) return { error: "Solo la administración puede dar de alta modelos." };
  const datos = leerModelo(formData);
  if ("error" in datos) return datos;
  const aviso = await revisarParecidos(datos);
  if (aviso) return aviso;

  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO modelos (nombre, nombre_clave, codigo, creado_por, actualizado_por) VALUES ($1, $2, $3, $4, $4) RETURNING id`,
        [datos.nombre, datos.clave, datos.codigo, yo]
      );
      await guardarTallas(client, rows[0].id, datos.tallas);
    });
  } catch (err) {
    const msg = errorDeBase(err);
    if (msg) return { error: msg, nombreEnviado: datos.nombre };
    throw err;
  }
  refrescar();
  return { success: `Modelo "${datos.nombre}" dado de alta.`, nombreEnviado: datos.nombre };
}

export async function editarModeloAction(_prev: ModeloResult | undefined, formData: FormData): Promise<ModeloResult> {
  const yo = await administracionVigente();
  if (!yo) return { error: "Solo la administración puede editar modelos." };
  const id = enteroPositivo(String(formData.get("id") ?? ""));
  if (!id) return { error: "Modelo no válido." };
  const datos = leerModelo(formData);
  if ("error" in datos) return datos;

  // Si el nombre no cambió, no se vuelve a preguntar por parecidos (ya se decidió al darlo de alta).
  const { rows: actual } = await query<{ nombre_clave: string }>("SELECT nombre_clave FROM modelos WHERE id = $1", [id]);
  if (!actual[0]) return { error: "Ese modelo ya no existe." };
  if (actual[0].nombre_clave !== datos.clave) {
    const aviso = await revisarParecidos(datos, id);
    if (aviso) return aviso;
  }

  try {
    const existe = await withTransaction(async (client) => {
      const r = await client.query(
        `UPDATE modelos SET nombre = $2, nombre_clave = $3, codigo = $4, actualizado_por = $5, actualizado_en = now() WHERE id = $1`,
        [id, datos.nombre, datos.clave, datos.codigo, yo]
      );
      if (!r.rowCount) return false;
      await guardarTallas(client, id, datos.tallas);
      return true;
    });
    if (!existe) return { error: "Ese modelo ya no existe." };
  } catch (err) {
    const msg = errorDeBase(err);
    if (msg) return { error: msg, nombreEnviado: datos.nombre };
    throw err;
  }
  refrescar();
  return { success: `Modelo "${datos.nombre}" actualizado.`, nombreEnviado: datos.nombre };
}

/** Descontinuar (deja de ofrecerse; conserva su historial) o reactivar un modelo. */
export async function cambiarEstadoModeloAction(_prev: ModeloResult | undefined, formData: FormData): Promise<ModeloResult> {
  const yo = await administracionVigente();
  if (!yo) return { error: "Solo la administración puede descontinuar modelos." };
  const id = enteroPositivo(String(formData.get("id") ?? ""));
  const activar = formData.get("activar") === "1";
  if (!id) return { error: "Modelo no válido." };
  const r = await query(
    `UPDATE modelos SET activo = $2, descontinuado_en = CASE WHEN $2 THEN NULL ELSE now() END,
            actualizado_por = $3, actualizado_en = now()
      WHERE id = $1 AND activo <> $2`,
    [id, activar, yo]
  );
  refrescar();
  if (!r.rowCount) return { error: activar ? "Ese modelo ya estaba activo." : "Ese modelo ya estaba descontinuado." };
  return { success: activar ? "Modelo reactivado." : "Modelo descontinuado. Su historial se conserva." };
}

/** Agrega una talla nueva (ej. 4XL o 28): al final, o justo después de la talla que se elija. */
export async function crearTallaAction(_prev: ModeloResult | undefined, formData: FormData): Promise<ModeloResult> {
  const yo = await administracionVigente();
  if (!yo) return { error: "Solo la administración puede agregar tallas." };
  const nombre = limpiarTalla(String(formData.get("talla") ?? ""));
  const despuesDe = enteroPositivo(String(formData.get("despues_de") ?? ""));
  if (!tallaValida(nombre)) return { error: "La talla lleva letras o números, máximo 10 (ej. 4XL, 28, 10-12)." };
  try {
    await withTransaction(async (client) => {
      // Se bloquea la lista para que dos altas a la vez no tomen el mismo lugar.
      await bloquearTallas(client);
      let orden: number;
      if (despuesDe) {
        const { rows } = await client.query<{ orden: number }>("SELECT orden FROM tallas WHERE id = $1", [despuesDe]);
        if (!rows[0]) throw new Error("TALLA_REF");
        orden = rows[0].orden + 1;
        await client.query("UPDATE tallas SET orden = orden + 1 WHERE orden >= $1", [orden]);
      } else {
        const { rows } = await client.query<{ orden: number }>("SELECT COALESCE(MAX(orden), 0) + 1 AS orden FROM tallas");
        orden = rows[0].orden;
      }
      await client.query("INSERT INTO tallas (nombre, orden) VALUES ($1, $2)", [nombre, orden]);
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return { error: `La talla ${nombre} ya existe.` };
    if (err instanceof Error && err.message === "TALLA_REF") return { error: "La talla de referencia ya no existe. Recarga la página." };
    const msg = errorDeBase(err);
    if (msg) return { error: msg };
    throw err;
  }
  refrescar();
  return { success: `Talla ${nombre} agregada.` };
}

/** Sube o baja una talla en la lista (intercambia su lugar con la de al lado). */
export async function moverTallaAction(_prev: ModeloResult | undefined, formData: FormData): Promise<ModeloResult> {
  const yo = await administracionVigente();
  if (!yo) return { error: "Solo la administración puede ordenar tallas." };
  const id = enteroPositivo(String(formData.get("id") ?? ""));
  const sube = formData.get("dir") === "sube";
  if (!id) return { error: "Talla no válida." };
  let movida: boolean;
  try {
    movida = await withTransaction(async (client) => {
      await bloquearTallas(client);
      // Se renumera 1..n por si hubiera órdenes repetidos, y luego se intercambia con la vecina.
      const { rows } = await client.query<{ id: number }>("SELECT id FROM tallas ORDER BY orden, id");
      const ids = rows.map((r) => r.id);
      const i = ids.indexOf(id);
      const j = sube ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= ids.length) return false;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await client.query(
        "UPDATE tallas SET orden = x.n::int FROM unnest($1::int[]) WITH ORDINALITY AS x(id, n) WHERE tallas.id = x.id",
        [ids]
      );
      return true;
    });
  } catch (err) {
    const msg = errorDeBase(err);
    if (msg) return { error: msg };
    throw err;
  }
  refrescar();
  return movida ? { success: "Orden actualizado." } : { error: sube ? "Esa talla ya es la primera." : "Esa talla ya es la última." };
}

/** Desactiva una talla (ya no se ofrece para modelos nuevos; los que la tienen la conservan) o la reactiva. */
export async function cambiarEstadoTallaAction(_prev: ModeloResult | undefined, formData: FormData): Promise<ModeloResult> {
  const yo = await administracionVigente();
  if (!yo) return { error: "Solo la administración puede desactivar tallas." };
  const id = enteroPositivo(String(formData.get("id") ?? ""));
  const activar = formData.get("activar") === "1";
  if (!id) return { error: "Talla no válida." };
  const r = await query("UPDATE tallas SET activa = $2 WHERE id = $1 AND activa <> $2", [id, activar]);
  refrescar();
  if (!r.rowCount) return { error: "Esa talla ya estaba así." };
  return { success: activar ? "Talla activada." : "Talla desactivada." };
}
