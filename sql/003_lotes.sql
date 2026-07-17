-- Lotes: un lote pertenece a exactamente una sucursal (9 filas totales: 3 precios x 3 sucursales).
-- Cada qr_token identifica automáticamente sucursal + precio al escanear.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS lotes (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  precio_mxn NUMERIC(10,2) NOT NULL CHECK (precio_mxn > 0),
  sucursal_id INTEGER NOT NULL REFERENCES sucursales(id),
  qr_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lotes_sucursal ON lotes(sucursal_id);
