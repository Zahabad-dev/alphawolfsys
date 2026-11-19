-- Catálogo de modelos (etapa 1 de "inventario por modelo").
--
-- Cada fila de `modelos` es lo que lleva UNA etiqueta y UN precio por sucursal: el modelo base
-- (ej. "MAJA REPELENTE") más su variante ("MC", "ML", "ML 2XL-3XL"), un distintivo opcional (material o
-- referente, ej. "PANA") y un color opcional. Si unas tallas cuestan más, se dan de alta como otra variante
-- (con su propia etiqueta). Las filas con el mismo modelo base son variantes del mismo modelo.
--
-- Las tallas de cada fila son SOLO control interno de la administración y la gerente: no se usan en la
-- venta ni en el conteo físico (la prenda ya trae su talla de fábrica y nuestra etiqueta va encima).
--
-- Etiqueta nueva: el QR lleva `qr_token` (corto, distinto de los UUID de `lotes`, para que el QR salga menos
-- denso). Las etiquetas viejas (por precio, tabla `lotes`) siguen funcionando igual; esto no las toca.
--
-- Es una migración ADITIVA: solo crea tablas nuevas. No toca ninguna tabla ni dato existente, así que
-- el sistema sigue funcionando igual si se corre antes del deploy. Es idempotente.

-- Tallas que maneja el negocio, en su orden de menor a mayor. Se pueden agregar, reordenar y
-- desactivar desde la app (una talla desactivada ya no se ofrece, pero los modelos que la tengan la conservan).
CREATE TABLE IF NOT EXISTS tallas (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE CHECK (nombre ~ '^[A-Z0-9/.-]{1,10}$' AND nombre ~ '[A-Z0-9]'),
  orden INTEGER NOT NULL,
  activa BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO tallas (nombre, orden) VALUES
  ('CH', 1), ('M', 2), ('G', 3), ('XL', 4), ('2XL', 5), ('3XL', 6)
ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS modelos (
  id SERIAL PRIMARY KEY,
  -- Partes del nombre (en mayúsculas, espacios normalizados). Las filas con el mismo nombre_base son
  -- variantes del mismo modelo.
  nombre_base TEXT NOT NULL CHECK (char_length(nombre_base) BETWEEN 3 AND 80),
  variante TEXT CHECK (variante IS NULL OR char_length(variante) BETWEEN 1 AND 30),
  distintivo TEXT CHECK (distintivo IS NULL OR char_length(distintivo) BETWEEN 1 AND 30),
  color TEXT CHECK (color IS NULL OR char_length(color) BETWEEN 1 AND 30),
  -- Nombre completo armado por la app con las partes: "MAJA REPELENTE MC PANA (ROJO)".
  nombre TEXT NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 3 AND 200),
  -- Para no duplicar: el nombre completo sin acentos, sin signos, en mayúsculas y con espacios únicos.
  nombre_clave TEXT NOT NULL UNIQUE CHECK (char_length(nombre_clave) >= 3),
  -- Texto corto para la etiqueta, si la administración lo acorta. NULL = se arma solo con las partes.
  texto_etiqueta TEXT CHECK (texto_etiqueta IS NULL OR char_length(texto_etiqueta) BETWEEN 3 AND 40),
  -- Lo que lleva el QR de la etiqueta nueva. Corto y en mayúsculas (QR menos denso, se lee mejor chico).
  qr_token TEXT NOT NULL UNIQUE DEFAULT ('WM-' || upper(substr(md5(gen_random_uuid()::text), 1, 12)))
    CHECK (qr_token ~ '^WM-[0-9A-F]{12}$'),
  -- Código corto opcional para buscarlo rápido (ej. MR-MC).
  codigo TEXT UNIQUE CHECK (codigo IS NULL OR codigo ~ '^[A-Z0-9-]{1,20}$'),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  descontinuado_en TIMESTAMPTZ,
  CONSTRAINT modelo_descontinuado_coherente CHECK (activo = (descontinuado_en IS NULL))
);

CREATE INDEX IF NOT EXISTS modelos_nombre_base_idx ON modelos (nombre_base);

-- Qué tallas maneja cada modelo (control interno, opcional). Sin cascada: un modelo con tallas (y, más
-- adelante, con precios) no se puede borrar por accidente.
CREATE TABLE IF NOT EXISTS modelo_tallas (
  modelo_id INTEGER NOT NULL REFERENCES modelos(id),
  talla_id INTEGER NOT NULL REFERENCES tallas(id),
  PRIMARY KEY (modelo_id, talla_id)
);
