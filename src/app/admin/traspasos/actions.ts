"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query, withTransaction } from "@/lib/db";
import { verificarUmbralYNotificar } from "@/lib/push";

export interface RegistrarTraspasoResult {
  error?: string;
  success?: string;
}

export async function registrarTraspasoAction(
  _prevState: RegistrarTraspasoResult | undefined,
  formData: FormData
): Promise<RegistrarTraspasoResult> {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") {
    return { error: "No autorizado." };
  }

  const loteOrigenId = Number(formData.get("lote_origen_id"));
  const sucursalDestinoId = Number(formData.get("sucursal_destino_id"));
  const cantidad = Number(formData.get("cantidad"));
  const nota = formData.get("nota");

  if (!loteOrigenId) return { error: "Selecciona el origen." };
  if (!sucursalDestinoId) return { error: "Selecciona el destino." };
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return { error: "La cantidad debe ser un número entero mayor a 0." };
  }

  const { rows: origenRows } = await query<{ precio_mxn: string; sucursal_id: number }>(
    "SELECT precio_mxn, sucursal_id FROM lotes WHERE id = $1",
    [loteOrigenId]
  );
  const origen = origenRows[0];
  if (!origen) return { error: "Precio de origen no encontrado." };
  if (origen.sucursal_id === sucursalDestinoId) {
    return { error: "El origen y el destino no pueden ser la misma sucursal." };
  }

  const { rows: destinoLoteRows } = await query<{ id: number }>(
    "SELECT id FROM lotes WHERE sucursal_id = $1 AND precio_mxn = $2",
    [sucursalDestinoId, origen.precio_mxn]
  );
  const destinoLote = destinoLoteRows[0];
  if (!destinoLote) {
    return {
      error: `El destino no tiene un precio de $${origen.precio_mxn} — créalo primero en Precios.`,
    };
  }

  const traspasoId = crypto.randomUUID();
  let stockOrigenAntes = 0;

  try {
    await withTransaction(async (client) => {
      const { rows: stockRows } = await client.query<{ stock: string }>(
        "SELECT stock FROM stock_actual WHERE lote_id = $1",
        [loteOrigenId]
      );
      const stock = Number(stockRows[0]?.stock ?? 0);
      if (cantidad > stock) {
        throw new Error(`STOCK_INSUFICIENTE:${stock}`);
      }
      stockOrigenAntes = stock;

      const notaFinal = typeof nota === "string" && nota ? nota : null;

      await client.query(
        `INSERT INTO movimientos_inventario
           (lote_id, sucursal_id, tipo, cantidad, usuario_id, nota, traspaso_id)
         VALUES ($1, $2, 'traspaso_salida', $3, $4, $5, $6)`,
        [loteOrigenId, origen.sucursal_id, -cantidad, Number(session.user.id), notaFinal, traspasoId]
      );

      await client.query(
        `INSERT INTO movimientos_inventario
           (lote_id, sucursal_id, tipo, cantidad, usuario_id, nota, traspaso_id)
         VALUES ($1, $2, 'traspaso_entrada', $3, $4, $5, $6)`,
        [destinoLote.id, sucursalDestinoId, cantidad, Number(session.user.id), notaFinal, traspasoId]
      );
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("STOCK_INSUFICIENTE")) {
      const stockDisponible = msg.split(":")[1];
      return { error: `Stock insuficiente en el origen: quedan ${stockDisponible} piezas.` };
    }
    throw err;
  }

  await verificarUmbralYNotificar(loteOrigenId, stockOrigenAntes, stockOrigenAntes - cantidad);

  revalidatePath("/admin/traspasos");
  revalidatePath("/admin/inventario");
  revalidatePath("/admin/corte");
  return { success: `Traspaso registrado: ${cantidad} piezas.` };
}
