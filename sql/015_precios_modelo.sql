-- Precios por modelo y sucursal, con historial (etapa 2 de "inventario por modelo"). Requiere la 014.
--
-- Cada modelo (cada variante con su etiqueta) tiene un precio en cada sucursal donde se vende. El mismo
-- modelo puede costar distinto según la sucursal. Cambiar un precio NO sobreescribe: se cierra el renglón
-- vigente (vigente_hasta) y se abre uno nuevo, así queda el historial de quién lo cambió y cuándo.
-- Las ventas pasadas guardan su propio precio en movimientos_inventario; esto no las toca.
--
-- Las etiquetas viejas (por precio, tabla `lotes`) siguen funcionando igual.
--
-- Es una migración ADITIVA: crea una tabla nueva y agrega una columna opcional (modelo_id) a
-- movimientos_inventario; no cambia ni borra datos. Es idempotente.

CREATE TABLE IF NOT EXISTS precios_modelo (
  id SERIAL PRIMARY KEY,
  modelo_id INTEGER NOT NULL REFERENCES modelos(id),
  sucursal_id INTEGER NOT NULL REFERENCES sucursales(id),
  precio_mxn NUMERIC(10,2) NOT NULL CHECK (precio_mxn > 0 AND precio_mxn < 1000000),
  vigente_desde TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL = es el precio actual. Con fecha = ya no aplica (se cambió o se quitó).
  vigente_hasta TIMESTAMPTZ,
  puesto_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  quitado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  -- Por qué se puso o cambió (opcional): "aumento de proveedor", "temporada", etc.
  nota TEXT CHECK (nota IS NULL OR char_length(nota) <= 200),
  CONSTRAINT precio_modelo_fechas CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

-- Un solo precio vigente por modelo y sucursal.
CREATE UNIQUE INDEX IF NOT EXISTS precios_modelo_vigente_uq
  ON precios_modelo (modelo_id, sucursal_id) WHERE vigente_hasta IS NULL;

CREATE INDEX IF NOT EXISTS precios_modelo_historial_idx
  ON precios_modelo (modelo_id, vigente_desde DESC);

-- Qué modelo se vendió (o salió), cuando se cobró con la etiqueta nueva. NULL = etiqueta de precio (como hoy).
-- Columna nueva y opcional: las ventas de siempre no cambian.
ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS modelo_id INTEGER REFERENCES modelos(id);
