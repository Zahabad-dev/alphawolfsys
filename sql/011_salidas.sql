-- Salidas de mercancía que NO son venta: regalos a clientes, prendas mandadas a
-- saldos, merma (dañadas), muestras, etc. Sin esto la prenda seguía contando en el
-- inventario aunque ya no estuviera físicamente.
--
-- Es una migración ADITIVA: amplía el CHECK de tipo y agrega una columna nueva
-- (nullable). El código anterior sigue funcionando igual si se corre antes del deploy.

-- 1) Nuevo tipo de movimiento 'salida' (baja de inventario, cantidad negativa).
ALTER TABLE movimientos_inventario DROP CONSTRAINT IF EXISTS movimientos_inventario_tipo_check;
ALTER TABLE movimientos_inventario
  ADD CONSTRAINT movimientos_inventario_tipo_check
  CHECK (tipo IN ('entrada', 'venta', 'ajuste', 'corte', 'traspaso_salida', 'traspaso_entrada', 'salida'));

ALTER TABLE movimientos_inventario DROP CONSTRAINT IF EXISTS venta_es_negativa;
ALTER TABLE movimientos_inventario
  ADD CONSTRAINT venta_es_negativa
  CHECK (tipo NOT IN ('venta', 'traspaso_salida', 'salida') OR cantidad < 0);

-- 2) Motivo de la salida (regalo, saldo, merma, muestra, otro). Solo aplica a 'salida'.
ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS motivo TEXT;

ALTER TABLE movimientos_inventario DROP CONSTRAINT IF EXISTS movimientos_motivo_valido;
ALTER TABLE movimientos_inventario
  ADD CONSTRAINT movimientos_motivo_valido
  CHECK (motivo IS NULL OR motivo IN ('regalo', 'saldo', 'merma', 'muestra', 'otro'));

-- Toda salida debe llevar motivo (si no, no se sabría por qué se fue la prenda).
ALTER TABLE movimientos_inventario DROP CONSTRAINT IF EXISTS salida_requiere_motivo;
ALTER TABLE movimientos_inventario
  ADD CONSTRAINT salida_requiere_motivo
  CHECK (tipo <> 'salida' OR motivo IS NOT NULL);
