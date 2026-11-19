"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query, withTransaction } from "@/lib/db";
import { puedeGestionar } from "@/lib/permisos";
import { leerPrecio } from "@/lib/modelos";

async function requireStaff() {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") {
    throw new Error("No autorizado");
  }
}

function etiquetaDe(precio: number) {
  return `$${precio.toFixed(2)}`;
}

/**
 * Los precios nuevos SIEMPRE nacen en el Almacén Central — es el catálogo
 * maestro. Para que una sucursal los use, hay que "asignarlos" (ver abajo).
 */
export async function crearPrecioAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const sesion = await auth();
  if (!sesion || !puedeGestionar(sesion.user.rol)) {
    return { error: "No tienes permiso para agregar precios al Almacén." };
  }

  const precio = formData.get("precio_mxn");
  const precioNum = Number(precio);
  if (!precioNum || precioNum <= 0) {
    return { error: "El precio debe ser mayor a 0." };
  }

  const { rows: almacenRows } = await query<{ id: number }>(
    "SELECT id FROM sucursales WHERE tipo = 'almacen' LIMIT 1"
  );
  const almacenId = almacenRows[0]?.id;
  if (!almacenId) return { error: "No se encontró el Almacén Central." };

  const { rows: existentes } = await query(
    "SELECT id FROM lotes WHERE sucursal_id = $1 AND precio_mxn = $2 AND activo = true",
    [almacenId, precioNum]
  );
  if (existentes.length > 0) {
    return { error: "El Almacén ya tiene ese precio activo." };
  }

  await query("INSERT INTO lotes (nombre, precio_mxn, sucursal_id) VALUES ($1, $2, $3)", [
    etiquetaDe(precioNum),
    precioNum,
    almacenId,
  ]);

  revalidatePath("/admin/precios");
  return { success: "Precio agregado al Almacén." };
}

/**
 * Toma un precio ya existente en el Almacén y crea su propia copia (con su
 * propio QR) en una sucursal. A partir de ahí esa copia se puede editar
 * independientemente (variación por sucursal) sin afectar al del Almacén.
 */
export async function asignarPrecioAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  await requireStaff();

  const precioMxn = formData.get("precio_mxn");
  const sucursalDestinoId = Number(formData.get("sucursal_destino_id"));

  const precioNum = Number(precioMxn);
  if (!precioNum || precioNum <= 0) {
    return { error: "Selecciona un precio del Almacén." };
  }
  if (!sucursalDestinoId) {
    return { error: "Selecciona la sucursal destino." };
  }

  const { rows: destinoRows } = await query<{ tipo: string }>(
    "SELECT tipo FROM sucursales WHERE id = $1",
    [sucursalDestinoId]
  );
  if (destinoRows[0]?.tipo !== "sucursal") {
    return { error: "El destino debe ser una sucursal (no el Almacén)." };
  }

  const { rows: existentes } = await query(
    "SELECT id FROM lotes WHERE sucursal_id = $1 AND precio_mxn = $2 AND activo = true",
    [sucursalDestinoId, precioNum]
  );
  if (existentes.length > 0) {
    return { error: "Esa sucursal ya tiene ese precio asignado." };
  }

  await query("INSERT INTO lotes (nombre, precio_mxn, sucursal_id) VALUES ($1, $2, $3)", [
    etiquetaDe(precioNum),
    precioNum,
    sucursalDestinoId,
  ]);

  revalidatePath("/admin/precios");
  return { success: `Precio de $${precioNum.toFixed(2)} asignado.` };
}

/**
 * Ajusta el precio de una copia ya asignada a una sucursal (variación local),
 * sin tocar el precio original en el Almacén.
 */
export async function actualizarPrecioAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session || !puedeGestionar(session.user.rol)) return { error: "No autorizado." };
  const yo = Number(session.user.id);
  const { rows: vigente } = await query<{ activo: boolean }>("SELECT activo FROM usuarios WHERE id = $1", [yo]);
  if (!vigente[0]?.activo) return { error: "No autorizado." };

  const id = Number(formData.get("id"));
  const precioNum = leerPrecio(String(formData.get("precio_mxn") ?? ""));

  if (!Number.isSafeInteger(id) || id <= 0) return { error: "Precio inválido." };
  if (precioNum === null) {
    return { error: "Escribe un precio válido, mayor a 0 (ej. 350 o 350.50)." };
  }

  let resultado: string | null;
  try {
    resultado = await withTransaction<string | null>(async (client) => {
      // Primero se bloquea el lote y DESPUÉS se revisan sus movimientos: una venta no puede colarse en medio.
      const { rows: antes } = await client.query<{ precio_mxn: string; sucursal_id: number; activo: boolean }>(
        "SELECT precio_mxn, sucursal_id, activo FROM lotes WHERE id = $1 FOR UPDATE",
        [id]
      );
      const viejo = antes[0];
      if (!viejo) return "Ese precio ya no existe. Recarga la página.";
      const { rows: movRows } = await client.query<{ total: string }>(
        "SELECT COUNT(*) AS total FROM movimientos_inventario WHERE lote_id = $1",
        [id]
      );
      if (Number(movRows[0]?.total ?? 0) > 0) {
        return "Este precio ya tiene ventas/movimientos y probablemente su QR ya está impreso — editarlo cambiaría lo que ese QR muestra. Desactívalo y crea uno nuevo en su lugar.";
      }
      await client.query("UPDATE lotes SET precio_mxn = $1, nombre = $2 WHERE id = $3", [
        precioNum,
        etiquetaDe(precioNum),
        id,
      ]);

      // Los modelos que tenían ese precio en esa sucursal se mueven con él (queda en su historial). Solo si
      // este precio está activo y no queda OTRO precio activo igual en la sucursal (si no, esos modelos
      // siguen bien donde están). Tabla reciente: si esta base aún no la tiene, se omite.
      if (!viejo.activo || Number(viejo.precio_mxn) === precioNum) return null;
      const { rows: tabla } = await client.query<{ existe: boolean }>(
        "SELECT to_regclass('public.precios_modelo') IS NOT NULL AS existe"
      );
      if (!tabla[0]?.existe) return null;
      const { rows: otro } = await client.query(
        "SELECT 1 FROM lotes WHERE sucursal_id = $1 AND precio_mxn = $2 AND activo AND id <> $3 LIMIT 1",
        [viejo.sucursal_id, viejo.precio_mxn, id]
      );
      if (otro.length) return null;
      const { rows: mover } = await client.query<{ id: number; modelo_id: number }>(
        `UPDATE precios_modelo SET vigente_hasta = clock_timestamp(), quitado_por = $3
          WHERE sucursal_id = $1 AND precio_mxn = $2 AND vigente_hasta IS NULL
          RETURNING id, modelo_id`,
        [viejo.sucursal_id, viejo.precio_mxn, yo]
      );
      for (const m of mover) {
        await client.query(
          `INSERT INTO precios_modelo (modelo_id, sucursal_id, precio_mxn, puesto_por, nota)
           VALUES ($1, $2, $3, $4, 'Cambió el precio en Precios')`,
          [m.modelo_id, viejo.sucursal_id, precioNum, yo]
        );
      }
      return null;
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505" || code === "23514") return { error: "No se pudo cambiar a ese precio. Recarga e inténtalo de nuevo." };
    throw err;
  }
  if (resultado) return { error: resultado };

  revalidatePath("/admin/precios");
  revalidatePath("/admin/modelos");
  return { success: "Precio actualizado." };
}

export async function togglePrecioActivoAction(formData: FormData) {
  await requireStaff();

  const id = Number(formData.get("id"));
  const activo = formData.get("activo") === "true";

  await query("UPDATE lotes SET activo = $1 WHERE id = $2", [!activo, id]);
  revalidatePath("/admin/precios");
}

export interface EliminarPrecioResult {
  error?: string;
  success?: string;
}

/**
 * Borra un precio por completo. Bloquea si ya tiene movimientos registrados
 * (ventas, entradas, traspasos) para no perder ese historial — en ese caso
 * hay que Desactivarlo en vez de eliminarlo.
 */
export async function eliminarPrecioAction(
  _prevState: EliminarPrecioResult | undefined,
  formData: FormData
): Promise<EliminarPrecioResult> {
  const session = await auth();
  if (!session || !puedeGestionar(session.user.rol)) {
    return { error: "No autorizado." };
  }

  const id = Number(formData.get("id"));
  const password = formData.get("password");

  if (!id) return { error: "Precio inválido." };
  if (typeof password !== "string" || !password) {
    return { error: "Escribe tu contraseña para confirmar." };
  }

  const { rows: adminRows } = await query<{ password_hash: string }>(
    "SELECT password_hash FROM usuarios WHERE id = $1",
    [Number(session.user.id)]
  );
  const passwordValida = adminRows[0]
    ? await bcrypt.compare(password, adminRows[0].password_hash)
    : false;
  if (!passwordValida) {
    return { error: "Contraseña incorrecta." };
  }

  const { rows: movRows } = await query<{ total: string }>(
    "SELECT COUNT(*) AS total FROM movimientos_inventario WHERE lote_id = $1",
    [id]
  );
  if (Number(movRows[0]?.total ?? 0) > 0) {
    return {
      error: "Este precio ya tiene ventas/movimientos registrados — no se puede eliminar sin perder ese historial. Usa Desactivar en su lugar.",
    };
  }

  await query("DELETE FROM lotes WHERE id = $1", [id]);

  revalidatePath("/admin/precios");
  return { success: "Precio eliminado." };
}
