"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query } from "@/lib/db";
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

  try {
    const r = await query(
      `INSERT INTO entradas_modelo (modelo_id, sucursal_id, tipo, piezas, nota, registrado_por, intento)
       SELECT m.id, s.id, $3, $4, $5, $6, $7 FROM modelos m, sucursales s
        WHERE m.id = $1 AND s.id = $2 AND s.activa
       ON CONFLICT (intento) DO NOTHING`,
      [modeloId, sucursalId, correccion ? "correccion" : "etiquetado", piezas, nota || null, yo, intento]
    );
    if (!r.rowCount) {
      // Ya estaba registrado este mismo intento (doble clic o reintento): no se cuenta doble.
      const { rows } = await query("SELECT 1 FROM entradas_modelo WHERE intento = $1", [intento]);
      if (!rows.length) return { error: "El modelo o la sucursal ya no existen. Recarga la página." };
    }
  } catch (err) {
    if ((err as { code?: string }).code === "42P01") return { error: "Falta preparar la base de datos (migración 016)." };
    throw err;
  }
  revalidatePath(`/admin/modelos/${modeloId}/etiqueta`);
  revalidatePath("/admin/modelos");
  const n = Math.abs(piezas);
  return {
    success: correccion
      ? `Corrección registrada: ${piezas > 0 ? "+" : "−"}${n} ${n === 1 ? "pieza" : "piezas"}.`
      : `Registradas ${n} ${n === 1 ? "pieza etiquetada" : "piezas etiquetadas"}.`,
    registrado: true,
  };
}
