-- Almacén Central: nueva "sucursal" especial (tipo='almacen') que no vende ni tiene
-- vendedores; recibe piezas por corte y las traspasa a las sucursales reales.
ALTER TABLE sucursales
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'sucursal' CHECK (tipo IN ('sucursal', 'almacen'));

INSERT INTO sucursales (clave, nombre, estado, tipo)
VALUES ('ALM', 'Almacén Central', 'Producción', 'almacen')
ON CONFLICT (clave) DO NOTHING;

-- Ampliar tipos de movimiento: 'corte' (piezas nuevas al almacén) y el par
-- 'traspaso_salida'/'traspaso_entrada' (mover piezas de almacén a sucursal, atómico).
ALTER TABLE movimientos_inventario DROP CONSTRAINT IF EXISTS movimientos_inventario_tipo_check;
ALTER TABLE movimientos_inventario
  ADD CONSTRAINT movimientos_inventario_tipo_check
  CHECK (tipo IN ('entrada', 'venta', 'ajuste', 'corte', 'traspaso_salida', 'traspaso_entrada'));

ALTER TABLE movimientos_inventario DROP CONSTRAINT IF EXISTS entrada_es_positiva;
ALTER TABLE movimientos_inventario
  ADD CONSTRAINT entrada_es_positiva CHECK (tipo NOT IN ('entrada', 'corte', 'traspaso_entrada') OR cantidad > 0);

ALTER TABLE movimientos_inventario DROP CONSTRAINT IF EXISTS venta_es_negativa;
ALTER TABLE movimientos_inventario
  ADD CONSTRAINT venta_es_negativa CHECK (tipo NOT IN ('venta', 'traspaso_salida') OR cantidad < 0);

-- Vincula las dos filas (salida en almacén + entrada en sucursal) de un mismo traspaso,
-- para trazabilidad/auditoría. No es único: solo agrupa el par.
ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS traspaso_id UUID;
CREATE INDEX IF NOT EXISTS idx_movimientos_traspaso ON movimientos_inventario(traspaso_id) WHERE traspaso_id IS NOT NULL;
