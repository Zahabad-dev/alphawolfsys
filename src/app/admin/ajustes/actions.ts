"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { auth } from "@/auth";
import { query, withTransaction } from "@/lib/db";
import { esAdmin } from "@/lib/permisos";
import { notificarStaff, verificarUmbralYNotificar } from "@/lib/push";
import {
  AjusteError,
  COMENTARIO_AJUSTE_MAX,
  COMENTARIO_AJUSTE_MIN,
  PIEZAS_AJUSTE_MAX,
  esMotivoAjuste,
  etiquetaMotivoAjuste,
  largoTexto,
  notaDeAjuste,
  type MotivoAjuste,
} from "@/lib/ajustes";
import { enteroPositivo } from "@/lib/historial";
import { limpiarFallos, minutosDeBloqueo, registrarFallo } from "@/lib/limite-intentos";
import type { Rol } from "@/types/next-auth";

export interface AjusteResult {
  error?: string;
  success?: string;
}

interface DatosAjuste {
  loteId: number;
  direccion: "suma" | "resta";
  piezas: number;
  motivo: MotivoAjuste;
  comentario: string;
  /** Identificador de este envío del formulario (evita duplicados por doble clic o reintento). */
  token: string | null;
  /** Solo en el modo "dejar la existencia exacta": la existencia con la que se calculó el ajuste. */
  existenciaEsperada: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lee y valida lo que viene del formulario; devuelve el error en español o los datos limpios. */
function leerAjuste(formData: FormData): { error: string } | DatosAjuste {
  const loteId = enteroPositivo(String(formData.get("lote_id") ?? ""));
  const direccion = formData.get("direccion");
  const piezas = enteroPositivo(String(formData.get("piezas") ?? ""));
  const motivo = formData.get("motivo");
  const comentario = String(formData.get("comentario") ?? "").trim();
  const token = String(formData.get("token") ?? "");
  const esperada = String(formData.get("existencia_esperada") ?? "");

  if (!loteId) return { error: "Elige el lugar y el precio." };
  if (direccion !== "suma" && direccion !== "resta") return { error: "Elige si el ajuste suma o resta piezas." };
  if (!piezas) return { error: "Las piezas deben ser un número entero mayor a 0." };
  if (piezas > PIEZAS_AJUSTE_MAX) {
    return { error: `Un ajuste no puede pasar de ${PIEZAS_AJUSTE_MAX.toLocaleString("es-MX")} piezas. Revisa la cantidad.` };
  }
  if (!esMotivoAjuste(motivo)) return { error: "Elige qué fue lo que pasó." };
  if (largoTexto(comentario) < COMENTARIO_AJUSTE_MIN) {
    return { error: `Cuenta qué pasó en el comentario (al menos ${COMENTARIO_AJUSTE_MIN} letras): es lo que queda documentado.` };
  }
  if (largoTexto(comentario) > COMENTARIO_AJUSTE_MAX) {
    return { error: `El comentario es muy largo (máximo ${COMENTARIO_AJUSTE_MAX} caracteres).` };
  }
  return {
    loteId,
    direccion,
    piezas,
    motivo,
    comentario,
    token: UUID.test(token) ? token : null,
    existenciaEsperada: /^-?\d{1,9}$/.test(esperada) ? Number(esperada) : null,
  };
}

interface UsuarioVigente {
  id: number;
  nombre: string;
  rol: Rol;
  password_hash: string;
}

/**
 * El usuario tal como está HOY en la base. La sesión guarda el rol por años; así una cuenta que se
 * desactivó o cambió de rol deja de poder actuar de inmediato, aunque su sesión siga abierta.
 */
async function usuarioVigente(usuarioId: number): Promise<UsuarioVigente | null> {
  const { rows } = await query<UsuarioVigente & { activo: boolean }>(
    "SELECT id, nombre, rol, activo, password_hash FROM usuarios WHERE id = $1",
    [usuarioId]
  );
  return rows[0]?.activo ? rows[0] : null;
}

/**
 * La contraseña de quien actúa, aunque ya tenga la sesión abierta (la pantalla puede quedarse
 * abierta en una tablet), con un freno a los intentos fallidos. Devuelve el error o null si es correcta.
 */
async function verificarContrasena(
  usuario: UsuarioVigente,
  password: unknown,
  mensajeSiFalta: string
): Promise<string | null> {
  if (typeof password !== "string" || !password) return mensajeSiFalta;
  const espera = minutosDeBloqueo(usuario.id);
  if (espera > 0) {
    return `Demasiados intentos con la contraseña equivocada. Espera ${espera} minuto${espera === 1 ? "" : "s"} e inténtalo de nuevo.`;
  }
  if (!(await bcrypt.compare(password, usuario.password_hash))) {
    registrarFallo(usuario.id);
    return "Contraseña incorrecta.";
  }
  limpiarFallos(usuario.id);
  return null;
}

function refrescar() {
  revalidatePath("/admin/ajustes");
  revalidatePath("/admin/inventario");
  revalidatePath("/inventario");
  revalidatePath("/admin/historial");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/corte");
  revalidatePath("/admin/traspasos");
}

function esTokenRepetido(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string };
  return e.code === "23505" && e.constraint === "uq_solicitudes_ajuste_token";
}

function mensajeDeError(err: unknown): string | null {
  if (!(err instanceof AjusteError)) return null;
  const n = err.existencia ?? 0;
  switch (err.codigo) {
    case "STOCK_INSUFICIENTE":
      return `Ya no alcanza: ahora solo hay ${n.toLocaleString("es-MX")} piezas de ese precio.`;
    case "STOCK_CAMBIO":
      return `La existencia cambió mientras lo preparabas (ahora hay ${n.toLocaleString("es-MX")}). Revisa el número y vuelve a intentarlo.`;
    case "NO_EXISTE":
      return "La solicitud ya no existe.";
    case "YA_RESUELTA":
      return "Esta solicitud ya fue resuelta por otra persona. Se actualizó la lista.";
  }
}

/**
 * La gerente pide un ajuste: queda PENDIENTE, con el motivo y un comentario, hasta que la
 * administración lo autorice o lo rechace. No cambia ninguna existencia por sí sola.
 */
export async function solicitarAjusteAction(
  _prev: AjusteResult | undefined,
  formData: FormData
): Promise<AjusteResult> {
  const session = await auth();
  if (!session || session.user.rol !== "gerente") {
    return { error: "No autorizado. Las solicitudes las hace la gerente; la administración ajusta directo." };
  }
  const yo = await usuarioVigente(Number(session.user.id));
  if (!yo || yo.rol !== "gerente") return { error: "Tu cuenta ya no puede pedir ajustes." };

  const datos = leerAjuste(formData);
  if ("error" in datos) return datos;

  const { rows } = await query<{ lugar: string; precio: string; stock: string; sucursal_id: number }>(
    `SELECT s.nombre AS lugar, l.precio_mxn AS precio, l.sucursal_id,
            COALESCE((SELECT SUM(cantidad) FROM movimientos_inventario WHERE lote_id = l.id), 0) AS stock
     FROM lotes l JOIN sucursales s ON s.id = l.sucursal_id
     WHERE l.id = $1`,
    [datos.loteId]
  );
  const lote = rows[0];
  if (!lote) return { error: "Precio no encontrado." };
  const stock = Number(lote.stock);
  if (datos.direccion === "resta" && datos.piezas > stock) {
    return { error: `En ${lote.lugar} solo hay ${stock} piezas de ese precio: no se pueden restar ${datos.piezas}.` };
  }

  try {
    await query(
      `INSERT INTO solicitudes_ajuste
         (lote_id, sucursal_id, direccion, piezas, motivo, comentario, existencia_al_solicitar, solicitado_por, token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [datos.loteId, lote.sucursal_id, datos.direccion, datos.piezas, datos.motivo, datos.comentario, stock, yo.id, datos.token]
    );
  } catch (err) {
    if (esTokenRepetido(err)) return { success: "Esa solicitud ya estaba enviada." };
    throw err;
  }

  // Solo a quien puede autorizar (administración y soporte), no a la gerente que la acaba de pedir.
  await notificarStaff(
    {
      title: "Ajuste por autorizar",
      body: `${lote.lugar} — $${Number(lote.precio)}: ${datos.direccion === "resta" ? "−" : "+"}${datos.piezas} piezas (${etiquetaMotivoAjuste(datos.motivo)}).`,
      url: "/admin/ajustes",
    },
    ["admin", "soporte"]
  );

  refrescar();
  return { success: "Solicitud enviada. Queda pendiente hasta que la administración la autorice." };
}

/** Aplica el ajuste en el ledger y deja la solicitud aprobada. Debe correr dentro de una transacción. */
async function aplicarAjuste(
  client: PoolClient,
  solicitudId: number,
  datos: { loteId: number; sucursalId: number; direccion: string; piezas: number; motivo: string; comentario: string },
  solicito: { id: number; nombre: string },
  autorizo: { id: number; nombre: string },
  comentarioRevision: string | null,
  existenciaEsperada: number | null
): Promise<{ stockAntes: number; stockDespues: number }> {
  // Se bloquea el lote para que dos ajustes o una venta a la vez no se pasen del stock.
  await client.query("SELECT id FROM lotes WHERE id = $1 FOR UPDATE", [datos.loteId]);
  const { rows } = await client.query<{ stock: string }>(
    "SELECT COALESCE(SUM(cantidad), 0) AS stock FROM movimientos_inventario WHERE lote_id = $1",
    [datos.loteId]
  );
  const stockAntes = Number(rows[0].stock);
  if (existenciaEsperada !== null && stockAntes !== existenciaEsperada) {
    throw new AjusteError("STOCK_CAMBIO", stockAntes);
  }
  const cantidad = datos.direccion === "resta" ? -datos.piezas : datos.piezas;
  if (cantidad < 0 && datos.piezas > stockAntes) {
    throw new AjusteError("STOCK_INSUFICIENTE", stockAntes);
  }

  const nota = notaDeAjuste({
    solicitudId,
    motivo: datos.motivo,
    comentario: datos.comentario,
    solicito: solicito.nombre,
    autorizo: autorizo.nombre,
  });
  const mov = await client.query<{ id: string }>(
    `INSERT INTO movimientos_inventario (lote_id, sucursal_id, tipo, cantidad, usuario_id, nota)
     VALUES ($1, $2, 'ajuste', $3, $4, $5) RETURNING id`,
    [datos.loteId, datos.sucursalId, cantidad, autorizo.id, nota]
  );
  await client.query(
    `UPDATE solicitudes_ajuste
        SET estado = 'aprobada', revisado_por = $2, revisado_en = now(), comentario_revision = $3, movimiento_id = $4
      WHERE id = $1`,
    [solicitudId, autorizo.id, comentarioRevision, mov.rows[0].id]
  );
  return { stockAntes, stockDespues: stockAntes + cantidad };
}

/**
 * La administración ajusta directo (sin pedir autorización a nadie), pero con el mismo motivo y
 * comentario obligatorios y con su contraseña. Queda en la misma bitácora de ajustes.
 */
export async function registrarAjusteDirectoAction(
  _prev: AjusteResult | undefined,
  formData: FormData
): Promise<AjusteResult> {
  const session = await auth();
  if (!session || !esAdmin(session.user.rol)) return { error: "No autorizado." };
  const yo = await usuarioVigente(Number(session.user.id));
  if (!yo || !esAdmin(yo.rol)) return { error: "Tu cuenta ya no puede hacer ajustes." };

  const datos = leerAjuste(formData);
  if ("error" in datos) return datos;

  const errorClave = await verificarContrasena(yo, formData.get("password"), "Escribe tu contraseña para confirmar.");
  if (errorClave) return { error: errorClave };

  const { rows } = await query<{ sucursal_id: number; lugar: string }>(
    "SELECT l.sucursal_id, s.nombre AS lugar FROM lotes l JOIN sucursales s ON s.id = l.sucursal_id WHERE l.id = $1",
    [datos.loteId]
  );
  const lote = rows[0];
  if (!lote) return { error: "Precio no encontrado." };

  let resultado: { stockAntes: number; stockDespues: number };
  try {
    resultado = await withTransaction(async (client) => {
      const sol = await client.query<{ id: number }>(
        `INSERT INTO solicitudes_ajuste
           (lote_id, sucursal_id, direccion, piezas, motivo, comentario, existencia_al_solicitar, solicitado_por, token)
         VALUES ($1, $2, $3, $4, $5, $6,
                 (SELECT COALESCE(SUM(cantidad), 0) FROM movimientos_inventario WHERE lote_id = $1), $7, $8)
         RETURNING id`,
        [datos.loteId, lote.sucursal_id, datos.direccion, datos.piezas, datos.motivo, datos.comentario, yo.id, datos.token]
      );
      return aplicarAjuste(
        client,
        sol.rows[0].id,
        { ...datos, sucursalId: lote.sucursal_id },
        yo,
        yo,
        null,
        datos.existenciaEsperada
      );
    });
  } catch (err) {
    if (esTokenRepetido(err)) return { success: "Ese ajuste ya estaba registrado." };
    const msg = mensajeDeError(err);
    if (msg) return { error: msg };
    throw err;
  }

  if (resultado.stockDespues < resultado.stockAntes) {
    await verificarUmbralYNotificar(datos.loteId, resultado.stockAntes, resultado.stockDespues);
  }
  refrescar();
  return {
    success: `Ajuste registrado en ${lote.lugar}: ${datos.direccion === "resta" ? "−" : "+"}${datos.piezas} piezas. Ahora hay ${resultado.stockDespues.toLocaleString("es-MX")}.`,
  };
}

/**
 * La administración autoriza o rechaza una solicitud pendiente. Al autorizar se vuelve a revisar
 * el stock (puede haber cambiado desde que se pidió) y se crea el movimiento de ajuste.
 */
export async function resolverSolicitudAction(
  _prev: AjusteResult | undefined,
  formData: FormData
): Promise<AjusteResult> {
  const session = await auth();
  if (!session || !esAdmin(session.user.rol)) return { error: "No autorizado." };
  const yo = await usuarioVigente(Number(session.user.id));
  if (!yo || !esAdmin(yo.rol)) return { error: "Tu cuenta ya no puede autorizar ajustes." };

  const id = enteroPositivo(String(formData.get("id") ?? ""));
  const decision = formData.get("decision");
  const comentarioRevision = String(formData.get("comentario_revision") ?? "").trim();
  if (!id || (decision !== "aprobar" && decision !== "rechazar")) return { error: "Solicitud no válida." };
  if (largoTexto(comentarioRevision) > COMENTARIO_AJUSTE_MAX) {
    return { error: `El comentario es muy largo (máximo ${COMENTARIO_AJUSTE_MAX} caracteres).` };
  }
  if (decision === "rechazar" && largoTexto(comentarioRevision) < 5) {
    return { error: "Explica brevemente por qué se rechaza: la gerente lo va a leer." };
  }
  if (decision === "aprobar") {
    const errorClave = await verificarContrasena(yo, formData.get("password"), "Para autorizar escribe tu contraseña.");
    if (errorClave) return { error: errorClave };
  }

  let resultado: { stockAntes: number; stockDespues: number; loteId: number } | null = null;
  try {
    resultado = await withTransaction(async (client) => {
      const { rows } = await client.query<{
        id: number;
        lote_id: number;
        sucursal_id: number;
        direccion: string;
        piezas: number;
        motivo: string;
        comentario: string;
        estado: string;
        solicito_id: number;
        solicito_nombre: string;
      }>(
        `SELECT sa.id, sa.lote_id, sa.sucursal_id, sa.direccion, sa.piezas, sa.motivo, sa.comentario, sa.estado,
                u.id AS solicito_id, u.nombre AS solicito_nombre
         FROM solicitudes_ajuste sa JOIN usuarios u ON u.id = sa.solicitado_por
         WHERE sa.id = $1 FOR UPDATE OF sa`,
        [id]
      );
      const sol = rows[0];
      if (!sol) throw new AjusteError("NO_EXISTE");
      if (sol.estado !== "pendiente") throw new AjusteError("YA_RESUELTA");

      if (decision === "rechazar") {
        await client.query(
          `UPDATE solicitudes_ajuste
              SET estado = 'rechazada', revisado_por = $2, revisado_en = now(), comentario_revision = $3
            WHERE id = $1`,
          [id, yo.id, comentarioRevision]
        );
        return null;
      }

      const r = await aplicarAjuste(
        client,
        sol.id,
        {
          loteId: sol.lote_id,
          sucursalId: sol.sucursal_id,
          direccion: sol.direccion,
          piezas: sol.piezas,
          motivo: sol.motivo,
          comentario: sol.comentario,
        },
        { id: sol.solicito_id, nombre: sol.solicito_nombre },
        yo,
        comentarioRevision || null,
        null
      );
      return { ...r, loteId: sol.lote_id };
    });
  } catch (err) {
    const msg = mensajeDeError(err);
    if (msg) {
      if (err instanceof AjusteError && err.codigo === "YA_RESUELTA") refrescar();
      return { error: msg };
    }
    throw err;
  }

  if (resultado && resultado.stockDespues < resultado.stockAntes) {
    await verificarUmbralYNotificar(resultado.loteId, resultado.stockAntes, resultado.stockDespues);
  }
  refrescar();
  return { success: decision === "aprobar" ? "Ajuste autorizado y aplicado." : "Solicitud rechazada." };
}

/** La gerente retira su propia solicitud mientras siga pendiente (por si se equivocó al escribirla). */
export async function cancelarSolicitudAction(
  _prev: AjusteResult | undefined,
  formData: FormData
): Promise<AjusteResult> {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") return { error: "No autorizado." };
  const yo = await usuarioVigente(Number(session.user.id));
  if (!yo || yo.rol === "vendedor") return { error: "Tu cuenta ya no puede hacer esto." };

  const id = enteroPositivo(String(formData.get("id") ?? ""));
  if (!id) return { error: "Solicitud no válida." };
  const r = await query(
    `UPDATE solicitudes_ajuste SET estado = 'cancelada', revisado_en = now()
      WHERE id = $1 AND solicitado_por = $2 AND estado = 'pendiente'`,
    [id, yo.id]
  );
  refrescar();
  return r.rowCount
    ? { success: "Solicitud retirada." }
    : { error: "Esa solicitud ya no estaba pendiente (la administración ya la resolvió)." };
}
