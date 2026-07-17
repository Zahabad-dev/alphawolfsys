-- Usuarios (admin global o vendedor por sucursal). Ejecutar con el usuario admin de Postgres.
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'vendedor')),
  sucursal_id INTEGER REFERENCES sucursales(id),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vendedor_requiere_sucursal CHECK (rol = 'admin' OR sucursal_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_sucursal ON usuarios(sucursal_id);

-- Seed de ejemplo para desarrollo local (cambiar contraseñas antes de producción):
-- INSERT INTO usuarios (username, password_hash, nombre, rol, sucursal_id)
-- VALUES ('admin', '<bcrypt-hash>', 'Wolf Daniels', 'admin', NULL)
-- ON CONFLICT (username) DO NOTHING;
