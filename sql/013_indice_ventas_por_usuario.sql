-- OPCIONAL: acelera el cuadro "Ventas por vendedor" (Vendedores) y la "Última venta" de cada uno.
--
-- Crea un índice sobre movimientos_inventario (una tabla que crece sin parar). Es aditivo y no cambia
-- ningún dato, pero mientras se construye bloquea escrituras en esa tabla unos segundos; por eso se
-- corre en un momento tranquilo (de noche), no en horario de ventas. Con el volumen de hoy el cuadro
-- funciona bien sin este índice: se corre solo cuando el historial ya sea grande.
CREATE INDEX IF NOT EXISTS idx_movimientos_usuario_tipo_fecha
  ON movimientos_inventario(usuario_id, tipo, creado_en);
