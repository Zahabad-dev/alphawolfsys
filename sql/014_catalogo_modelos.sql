-- Catálogo de modelos (etapa 1 de "inventario por modelo").
--
-- Un modelo es el nombre completo de la prenda tal como lo usa el negocio, con su manga y color
-- (ej. "CAMISA CUADRO FRANELA ADULTO M/L (ROJO)"); manga larga y manga corta son modelos distintos.
-- Cada modelo dice qué tallas maneja (no todos tienen todas). La administración los da de alta a mano
-- y los puede descontinuar (dejan de ofrecerse, pero conservan su historial). Los modelos no se borran.
--
-- Etapas siguientes (no en este archivo): grupos de precio por rango de tallas, precio por sucursal,
-- etiqueta QR del Almacén por modelo y rango, inventario y venta por modelo. Esas tablas apuntarán a
-- (modelo, talla); por eso aquí las tallas de un modelo se agregan/quitan por diferencia y no se
-- reescriben, y nada se borra en cascada.
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
  -- Como se muestra (en mayúsculas, espacios normalizados).
  nombre TEXT NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 3 AND 120),
  -- Para no duplicar: el nombre sin acentos, sin signos, en mayúsculas y con espacios únicos. Dos modelos
  -- no pueden tener la misma clave ("Camisa  cuadro (rojo)" y "CAMISA CUADRO ROJO" son el mismo).
  nombre_clave TEXT NOT NULL UNIQUE CHECK (char_length(nombre_clave) >= 3),
  -- Código corto opcional para buscarlo rápido (ej. CF-ML-ROJO).
  codigo TEXT UNIQUE CHECK (codigo IS NULL OR codigo ~ '^[A-Z0-9-]{1,20}$'),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_por INTEGER REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por INTEGER REFERENCES usuarios(id),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  descontinuado_en TIMESTAMPTZ,
  CONSTRAINT modelo_descontinuado_coherente CHECK (activo = (descontinuado_en IS NULL))
);

-- Qué tallas maneja cada modelo. Sin cascada: un modelo con tallas (y, más adelante, con precios e
-- inventario) no se puede borrar por accidente.
CREATE TABLE IF NOT EXISTS modelo_tallas (
  modelo_id INTEGER NOT NULL REFERENCES modelos(id),
  talla_id INTEGER NOT NULL REFERENCES tallas(id),
  PRIMARY KEY (modelo_id, talla_id)
);
