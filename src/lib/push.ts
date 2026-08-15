import webpush from "web-push";
import { query } from "./db";

let vapidConfigurado = false;

function asegurarVapid() {
  if (vapidConfigurado) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails("mailto:zahabad@blacksheepagencia.com", publicKey, privateKey);
  vapidConfigurado = true;
  return true;
}

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Manda un push a todo el staff (admin + gerente) suscrito. Nunca lanza: una
 * notificación fallida no debe tumbar la venta/ajuste/traspaso que la disparó.
 */
export async function notificarStaff(payload: { title: string; body: string; url?: string }) {
  if (!asegurarVapid()) return;

  try {
    const { rows } = await query<SubRow>(
      `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       JOIN usuarios u ON u.id = ps.usuario_id
       WHERE u.rol IN ('admin', 'gerente') AND u.activo = true`
    );

    await Promise.all(
      rows.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload)
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await query("DELETE FROM push_subscriptions WHERE id = $1", [sub.id]);
          }
        }
      })
    );
  } catch {
    // No dejar que una falla de notificaciones interrumpa la operación real.
  }
}

/**
 * Revisa si un movimiento hizo que el stock de un lote cruzara su umbral hacia
 * abajo (no repite el aviso en cada venta subsecuente mientras siga bajo).
 */
export async function verificarUmbralYNotificar(
  loteId: number,
  stockAntes: number,
  stockDespues: number
) {
  if (stockDespues >= stockAntes) return;

  try {
    const { rows } = await query<{ umbral_stock: number; nombre: string; sucursal_nombre: string }>(
      `SELECT l.umbral_stock, l.nombre, s.nombre AS sucursal_nombre
       FROM lotes l JOIN sucursales s ON s.id = l.sucursal_id
       WHERE l.id = $1`,
      [loteId]
    );
    const lote = rows[0];
    if (!lote) return;

    const cruzoUmbral = stockAntes > lote.umbral_stock && stockDespues <= lote.umbral_stock;
    if (!cruzoUmbral) return;

    await notificarStaff({
      title: "Stock bajo",
      body: `${lote.sucursal_nombre} — ${lote.nombre}: quedan ${stockDespues} piezas (mínimo ${lote.umbral_stock}).`,
      url: "/admin/inventario",
    });
  } catch {
    // Igual que arriba: nunca interrumpir la operación real por esto.
  }
}
