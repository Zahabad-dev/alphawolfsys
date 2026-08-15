-- Umbral de stock bajo configurable por precio (antes era un número fijo global
-- solo visible en el dashboard). Cada precio puede tener su propio mínimo.
ALTER TABLE lotes ADD COLUMN IF NOT EXISTS umbral_stock INTEGER NOT NULL DEFAULT 10 CHECK (umbral_stock >= 0);

-- Suscripciones a notificaciones push (Web Push), una fila por dispositivo/navegador
-- que un admin o gerente autorizó. Se borran solas si el navegador la invalida.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_usuario ON push_subscriptions(usuario_id);
