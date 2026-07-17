-- Datos de ejemplo para desarrollo/pruebas. NO ejecutar en producción.
-- Contraseñas en texto plano (solo para referencia del que siembra los datos):
--   admin          / WolfAdmin2026
--   vendedor_cdmx  / Vendedor2026
--   vendedor_gdl   / Vendedor2026
--   vendedor_mty   / Vendedor2026

INSERT INTO sucursales (clave, nombre, estado) VALUES
  ('CDMX', 'Sucursal Ciudad de México', 'Ciudad de México'),
  ('GDL', 'Sucursal Guadalajara', 'Jalisco'),
  ('MTY', 'Sucursal Monterrey', 'Nuevo León')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO usuarios (username, password_hash, nombre, rol, sucursal_id) VALUES
  ('admin', '$2b$10$xaGpCINbCCvwx1CRdOWpU.k7B9GUbIAiSjtjTjEpJNEGaOHHvYOeW', 'Wolf Daniels', 'admin', NULL),
  ('vendedor_cdmx', '$2b$10$zGBiBOvKWGyKMt0ewqy2B.co/Y.ih3lk0k4UO4MLnY8l2f4XJnc7y', 'Vendedor CDMX', 'vendedor', (SELECT id FROM sucursales WHERE clave = 'CDMX')),
  ('vendedor_gdl', '$2b$10$I41u1D3kY4GpdeqM1XgituINkgoxP0pir1VS7QsusfsvB3naO70eq', 'Vendedor GDL', 'vendedor', (SELECT id FROM sucursales WHERE clave = 'GDL')),
  ('vendedor_mty', '$2b$10$Q1QkNV5JygtyQ5i3wJLcK.rA.pdDrgZXpOEBHU/ULRdjRr6uHaMuK', 'Vendedor MTY', 'vendedor', (SELECT id FROM sucursales WHERE clave = 'MTY'))
ON CONFLICT (username) DO NOTHING;

-- 9 lotes: 3 precios x 3 sucursales
INSERT INTO lotes (nombre, precio_mxn, sucursal_id) VALUES
  ('Lote A - $168', 168, (SELECT id FROM sucursales WHERE clave = 'CDMX')),
  ('Lote B - $180', 180, (SELECT id FROM sucursales WHERE clave = 'CDMX')),
  ('Lote C - $200', 200, (SELECT id FROM sucursales WHERE clave = 'CDMX')),
  ('Lote A - $168', 168, (SELECT id FROM sucursales WHERE clave = 'GDL')),
  ('Lote B - $180', 180, (SELECT id FROM sucursales WHERE clave = 'GDL')),
  ('Lote C - $200', 200, (SELECT id FROM sucursales WHERE clave = 'GDL')),
  ('Lote A - $168', 168, (SELECT id FROM sucursales WHERE clave = 'MTY')),
  ('Lote B - $180', 180, (SELECT id FROM sucursales WHERE clave = 'MTY')),
  ('Lote C - $200', 200, (SELECT id FROM sucursales WHERE clave = 'MTY'));

-- Entradas iniciales de stock (50 piezas por lote), registradas por el admin
INSERT INTO movimientos_inventario (lote_id, sucursal_id, tipo, cantidad, usuario_id, nota)
SELECT l.id, l.sucursal_id, 'entrada', 50, (SELECT id FROM usuarios WHERE username = 'admin'), 'Stock inicial de prueba'
FROM lotes l;
