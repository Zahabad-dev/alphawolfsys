"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import type { PoolClient } from "pg";
import { auth } from "@/auth";
import { query, withTransaction } from "@/lib/db";
import { enteroPositivo } from "@/lib/historial";
import { verificarUmbralYNotificar } from "@/lib/push";
import type { Rol } from "@/types/next-auth";

export interface TraspasoModeloResult {
  error?: string;
  success?: string;
  hecho?: boolean;
}

const NOTA_MAX = 200;
const PIEZAS_MAX = 100000;

/**
 * Precio del modelo en una sucursal: el suyo; si no tiene, el del Almacén (igual que en la venta, para que
 * la pieza llegue justo al precio con el que se va a cobrar ahí).
 */
async function precioDelModelo(client: PoolClient, modeloId: number, sucursalId: number): Promise<string | null> {
  const { rows } = await client.query<{ precio_mxn: string }>(
    `SELECT pm.precio_mxn FROM precios_modelo pm JOIN sucursales s ON s.id = pm.sucursal_id
      WHERE pm.modelo_id = $1 AND pm.vigente_hasta IS NULL AND (pm.sucursal_id = $2 OR s.tipo = 'almacen')
      ORDER BY (pm.sucursal_id = $2) DESC LIMIT 1`,
    [modeloId, sucursalId]
  );
  return rows[0]?.precio_mxn ?? null;
}

class ErrorTraspaso extends Error {}

/**
 * Traspaso por MODELO: saca las piezas del precio que el modelo tiene en el origen y las mete al precio que el
 * modelo tiene en el destino (pueden ser distintos: $185 en Almacén → $160 en Moroleón). Así, cuando la
 * vendedora cobre con la etiqueta del modelo, las piezas ya están en el precio correcto. Si el destino no
 * maneja ese precio en Precios, se agrega. Los movimientos quedan con su modelo.
 */
export async function registrarTraspasoModeloAction(
  _prev: TraspasoModeloResult | undefined,
  formData: FormData
): Promise<TraspasoModeloResult> {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") return { error: "No autorizado." };
  const yo = Number(session.user.id);
  const { rows: u } = await query<{ rol: Rol; activo: boolean }>("SELECT rol, activo FROM usuarios WHERE id = $1", [yo]);
  if (!u[0]?.activo || u[0].rol === "vendedor") return { error: "No autorizado." };

  const modeloId = enteroPositivo(String(formData.get("modelo_id") ?? ""));
  const origenId = enteroPositivo(String(formData.get("origen_id") ?? ""));
  const destinoId = enteroPositivo(String(formData.get("destino_id") ?? ""));
  const texto = String(formData.get("cantidad") ?? "").trim();
  const nota = String(formData.get("nota") ?? "").replace(/\s+/g, " ").trim();
  if (!modeloId) return { error: "Elige un modelo de la lista." };
  if (!origenId || !destinoId) return { error: "Elige el origen y el destino." };
  if (origenId === destinoId) return { error: "El origen y el destino no pueden ser la misma sucursal." };
  if (!/^[1-9]\d{0,5}$/.test(texto) || Number(texto) > PIEZAS_MAX) return { error: "Escribe cuántas piezas (número entero)." };
  if (nota.length > NOTA_MAX) return { error: `La nota lleva máximo ${NOTA_MAX} caracteres.` };
  const cantidad = Number(texto);

  let resumen: { modelo: string; precioO: string; precioD: string; origen: string; destino: string; loteO: number; antes: number };
  try {
    resumen = await withTransaction(async (client) => {
      const { rows: m } = await client.query<{ nombre: string }>("SELECT nombre FROM modelos WHERE id = $1", [modeloId]);
      if (!m[0]) throw new ErrorTraspaso("Ese modelo ya no existe.");
      const { rows: sucs } = await client.query<{ id: number; nombre: string }>(
        "SELECT id, nombre FROM sucursales WHERE id = ANY($1::int[]) AND activa",
        [[origenId, destinoId]]
      );
      const nombreDe = (id: number) => sucs.find((s) => s.id === id)?.nombre;
      if (!nombreDe(origenId) || !nombreDe(destinoId)) throw new ErrorTraspaso("Alguna sucursal ya no está activa. Recarga la página.");

      const precioO = await precioDelModelo(client, modeloId, origenId);
      const precioD = await precioDelModelo(client, modeloId, destinoId);
      if (!precioO) throw new ErrorTraspaso(`${m[0].nombre} no tiene precio en ${nombreDe(origenId)} ni en el Almacén. Ponle precio primero.`);
      if (!precioD) throw new ErrorTraspaso(`${m[0].nombre} no tiene precio en ${nombreDe(destinoId)} ni en el Almacén. Ponle precio primero.`);

      const { rows: lo } = await client.query<{ id: number }>(
        "SELECT id FROM lotes WHERE sucursal_id = $1 AND precio_mxn = $2 AND activo ORDER BY id LIMIT 1",
        [origenId, precioO]
      );
      if (!lo[0]) throw new ErrorTraspaso(`${nombreDe(origenId)} no maneja $${Number(precioO).toFixed(2)} en Precios.`);
      let { rows: ld } = await client.query<{ id: number; activo: boolean }>(
        "SELECT id, activo FROM lotes WHERE sucursal_id = $1 AND precio_mxn = $2 ORDER BY activo DESC, id LIMIT 1",
        [destinoId, precioD]
      );
      if (ld[0] && !ld[0].activo) {
        throw new ErrorTraspaso(`${nombreDe(destinoId)} tiene $${Number(precioD).toFixed(2)} desactivado en Precios. Actívalo primero.`);
      }
      if (!ld[0]) {
        ({ rows: ld } = await client.query<{ id: number; activo: boolean }>(
          "INSERT INTO lotes (nombre, precio_mxn, sucursal_id) VALUES ($1, $2, $3) RETURNING id, activo",
          [`$${Number(precioD).toFixed(2)}`, precioD, destinoId]
        ));
      }

      // Se bloquean los dos precios (en orden de id) y se revisa la existencia del origen ya bloqueado.
      await client.query("SELECT id FROM lotes WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE", [[lo[0].id, ld[0].id]]);
      const { rows: st } = await client.query<{ stock: string }>("SELECT stock FROM stock_actual WHERE lote_id = $1", [lo[0].id]);
      const antes = Number(st[0]?.stock ?? 0);
      if (cantidad > antes) {
        throw new ErrorTraspaso(`En ${nombreDe(origenId)} solo hay ${antes} piezas de $${Number(precioO).toFixed(2)}.`);
      }

      const traspasoId = crypto.randomUUID();
      const notaFinal = `Modelo: ${m[0].nombre}${nota ? ` — ${nota}` : ""}`.slice(0, 500);
      await client.query(
        `INSERT INTO movimientos_inventario (lote_id, sucursal_id, tipo, cantidad, usuario_id, nota, traspaso_id, modelo_id)
         VALUES ($1, $2, 'traspaso_salida', $3, $4, $5, $6, $7)`,
        [lo[0].id, origenId, -cantidad, yo, notaFinal, traspasoId, modeloId]
      );
      await client.query(
        `INSERT INTO movimientos_inventario (lote_id, sucursal_id, tipo, cantidad, usuario_id, nota, traspaso_id, modelo_id)
         VALUES ($1, $2, 'traspaso_entrada', $3, $4, $5, $6, $7)`,
        [ld[0].id, destinoId, cantidad, yo, notaFinal, traspasoId, modeloId]
      );
      return {
        modelo: m[0].nombre,
        precioO,
        precioD,
        origen: nombreDe(origenId)!,
        destino: nombreDe(destinoId)!,
        loteO: lo[0].id,
        antes,
      };
    });
  } catch (err) {
    if (err instanceof ErrorTraspaso) return { error: err.message };
    const code = (err as { code?: string }).code;
    if (code === "42P01" || code === "42703") return { error: "Falta preparar la base de datos para traspasos por modelo." };
    throw err;
  }

  try {
    await verificarUmbralYNotificar(resumen.loteO, resumen.antes, resumen.antes - cantidad);
  } catch {
    // el traspaso ya quedó; un fallo al avisar no lo tumba
  }
  revalidatePath("/admin/traspasos");
  revalidatePath("/admin/inventario");
  revalidatePath("/admin/corte");
  const cambio = Number(resumen.precioO) !== Number(resumen.precioD);
  return {
    success:
      `Traspaso registrado: ${cantidad} ${cantidad === 1 ? "pieza" : "piezas"} de ${resumen.modelo}, ` +
      `de ${resumen.origen} ($${Number(resumen.precioO).toFixed(2)}) a ${resumen.destino} ($${Number(resumen.precioD).toFixed(2)})` +
      (cambio ? " — llegan al precio de esa sucursal." : "."),
    hecho: true,
  };
}
