-- Conteo interno por modelo (requiere la 014). Cuando en el Almacén etiquetan prendas con la etiqueta nueva,
-- registran cuántas piezas de ese modelo etiquetaron. Existencia del modelo = etiquetadas (+/- correcciones)
-- − vendidas − salidas con etiqueta de ese modelo (movimientos_inventario.modelo_id, de la 015).
--
-- Es SOLO control interno: no cambia el inventario por precio (lotes), ni el corte, ni la venta.
-- Es una migración ADITIVA: solo crea una tabla nueva. Es idempotente.

CREATE TABLE IF NOT EXISTS entradas_modelo (
  id SERIAL PRIMARY KEY,
  modelo_id INTEGER NOT NULL REFERENCES modelos(id),
  -- Dónde se etiquetaron (normalmente el Almacén).
  sucursal_id INTEGER NOT NULL REFERENCES sucursales(id),
  -- 'etiquetado' suma piezas; 'correccion' puede sumar o restar (ej. se imprimieron de más), con nota.
  tipo TEXT NOT NULL CHECK (tipo IN ('etiquetado', 'correccion')),
  piezas INTEGER NOT NULL CHECK (piezas <> 0 AND piezas BETWEEN -10000 AND 10000),
  nota TEXT CHECK (nota IS NULL OR char_length(nota) <= 200),
  registrado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  -- Una llave por intento: si el mismo envío llega dos veces (doble clic, reintento), no se cuenta doble.
  intento UUID UNIQUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT entrada_modelo_coherente CHECK (
    (tipo = 'etiquetado' AND piezas > 0) OR (tipo = 'correccion' AND nota IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS entradas_modelo_modelo_idx ON entradas_modelo (modelo_id, creado_en DESC);
