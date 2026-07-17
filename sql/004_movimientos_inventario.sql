-- Ledger append-only: cada cambio de stock es una fila con autor, tipo y fecha.
-- El stock actual siempre se recalcula con SUM(), nunca se sobreescribe (ver vista stock_actual).
CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id BIGSERIAL PRIMARY KEY,
  lote_id INTEGER NOT NULL REFERENCES lotes(id),
  sucursal_id INTEGER NOT NULL REFERENCES sucursales(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'venta', 'ajuste')),
  cantidad INTEGER NOT NULL CHECK (cantidad <> 0),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  precio_unitario_mxn NUMERIC(10,2),
  nota TEXT,
  idempotency_key UUID,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venta_es_negativa CHECK (tipo <> 'venta' OR cantidad < 0),
  CONSTRAINT entrada_es_positiva CHECK (tipo <> 'entrada' OR cantidad > 0)
);

CREATE INDEX IF NOT EXISTS idx_movimientos_lote ON movimientos_inventario(lote_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_sucursal ON movimientos_inventario(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_creado_en ON movimientos_inventario(creado_en);
CREATE UNIQUE INDEX IF NOT EXISTS uq_movimientos_idempotency
  ON movimientos_inventario(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE VIEW stock_actual AS
SELECT
  l.id AS lote_id,
  l.sucursal_id,
  l.nombre,
  l.precio_mxn,
  COALESCE(SUM(m.cantidad), 0) AS stock
FROM lotes l
LEFT JOIN movimientos_inventario m ON m.lote_id = l.id
GROUP BY l.id, l.sucursal_id, l.nombre, l.precio_mxn;
