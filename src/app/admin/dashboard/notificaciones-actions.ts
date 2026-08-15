"use server";

import { auth } from "@/auth";
import { query } from "@/lib/db";

async function requireStaff() {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") {
    throw new Error("No autorizado");
  }
  return session;
}

export async function guardarSuscripcionAction(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  const session = await requireStaff();

  await query(
    `INSERT INTO push_subscriptions (usuario_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET usuario_id = $1, p256dh = $3, auth = $4`,
    [Number(session.user.id), input.endpoint, input.p256dh, input.auth]
  );
}

export async function eliminarSuscripcionAction(input: { endpoint: string }) {
  await requireStaff();
  await query("DELETE FROM push_subscriptions WHERE endpoint = $1", [input.endpoint]);
}
