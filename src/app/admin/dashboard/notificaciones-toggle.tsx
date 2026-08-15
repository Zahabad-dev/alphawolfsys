"use client";

import { useEffect, useState } from "react";
import { guardarSuscripcionAction, eliminarSuscripcionAction } from "./notificaciones-actions";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function claveDeSuscripcion(sub: PushSubscription, nombre: string): string {
  const key = sub.getKey(nombre as "p256dh" | "auth");
  if (!key) return "";
  return btoa(String.fromCharCode(...new Uint8Array(key)));
}

type Estado = "cargando" | "no-soportado" | "sin-clave" | "inactivo" | "activo";

export default function NotificacionesToggle() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setEstado("no-soportado");
        return;
      }
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        setEstado("sin-clave");
        return;
      }
      const registro = await navigator.serviceWorker.ready;
      const sub = await registro.pushManager.getSubscription();
      setEstado(sub ? "activo" : "inactivo");
    })();
  }, []);

  async function activar() {
    setBusy(true);
    setError(null);
    try {
      const registro = await navigator.serviceWorker.ready;
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setError("No diste permiso de notificaciones en el navegador.");
        setBusy(false);
        return;
      }

      const sub = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });

      await guardarSuscripcionAction({
        endpoint: sub.endpoint,
        p256dh: claveDeSuscripcion(sub, "p256dh"),
        auth: claveDeSuscripcion(sub, "auth"),
      });

      setEstado("activo");
    } catch {
      setError("No se pudo activar las notificaciones.");
    }
    setBusy(false);
  }

  async function desactivar() {
    setBusy(true);
    setError(null);
    try {
      const registro = await navigator.serviceWorker.ready;
      const sub = await registro.pushManager.getSubscription();
      if (sub) {
        await eliminarSuscripcionAction({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setEstado("inactivo");
    } catch {
      setError("No se pudo desactivar las notificaciones.");
    }
    setBusy(false);
  }

  if (estado === "cargando") return null;
  if (estado === "no-soportado" || estado === "sin-clave") return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-brand-gray2 p-4 text-sm">
      <span className="text-brand-cream/80">
        Notificaciones de stock bajo en este dispositivo:{" "}
        <strong className={estado === "activo" ? "text-brand-green" : "text-brand-cream/50"}>
          {estado === "activo" ? "activas" : "inactivas"}
        </strong>
      </span>
      <button
        type="button"
        onClick={estado === "activo" ? desactivar : activar}
        disabled={busy}
        className="ml-auto rounded-full border border-white/20 px-4 py-1.5 text-brand-cream disabled:opacity-50"
      >
        {busy ? "..." : estado === "activo" ? "Desactivar" : "Activar"}
      </button>
      {error && <p className="w-full text-brand-red">{error}</p>}
    </div>
  );
}
