-- Sucursales de Wolf Daniels (3 estados). Ejecutar con el usuario admin de Postgres.
CREATE TABLE IF NOT EXISTS sucursales (
  id SERIAL PRIMARY KEY,
  clave TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  estado TEXT NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
