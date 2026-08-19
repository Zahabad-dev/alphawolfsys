-- Rol "soporte": login propio, sin acceso al inventario, solo ve la bandeja
-- de errores que le manda n8n (bot de WhatsApp, respaldo diario, etc.).
ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('admin', 'gerente', 'vendedor', 'soporte'));

ALTER TABLE usuarios DROP CONSTRAINT vendedor_requiere_sucursal;
ALTER TABLE usuarios ADD CONSTRAINT vendedor_requiere_sucursal
  CHECK (rol IN ('admin', 'gerente', 'soporte') OR sucursal_id IS NOT NULL);

-- Errores/alertas que llegan de sistemas externos (n8n), no del inventario.
CREATE TABLE IF NOT EXISTS errores_soporte (
  id SERIAL PRIMARY KEY,
  origen TEXT NOT NULL,
  workflow TEXT,
  mensaje TEXT NOT NULL,
  detalle JSONB,
  resuelto BOOLEAN NOT NULL DEFAULT false,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_errores_soporte_resuelto ON errores_soporte(resuelto, creado_en DESC);
