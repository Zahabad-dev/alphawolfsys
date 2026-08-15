-- Venta contada pieza por pieza: cada lectura del QR registra su propio movimiento
-- (cantidad = -1) en vez de un solo total tecleado. venta_id agrupa las piezas de
-- una misma sesión de venta para poder mostrar el conteo en vivo, deshacer la
-- última pieza o cancelar la venta completa antes de finalizar.
ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS venta_id UUID;
CREATE INDEX IF NOT EXISTS idx_movimientos_venta ON movimientos_inventario(venta_id) WHERE venta_id IS NOT NULL;
