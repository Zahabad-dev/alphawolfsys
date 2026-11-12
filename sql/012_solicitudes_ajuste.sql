-- Ajustes de inventario con motivo, comentario y autorización.
--
-- Un ajuste corrige las piezas de un lugar y precio (error de captura, error de conteo, mala
-- instrucción de inventario, prenda dañada, otro problema interno). La gerente NO ajusta por su
-- cuenta: registra una solicitud con el motivo y un comentario, y la administración la autoriza
-- o la rechaza. Al autorizarse se crea el movimiento 'ajuste' en el ledger (movimientos_inventario)
-- y la solicitud queda ligada a él. Los ajustes que hace la administración directamente también
-- dejan su fila aquí (ya aprobada por quien la hizo), para que esta tabla sea la bitácora completa.
--
-- Es una migración ADITIVA: solo crea una tabla nueva y sus índices. No toca ninguna tabla ni
-- dato existente, así que el código anterior sigue funcionando igual si se corre antes del deploy.
-- Es idempotente (IF NOT EXISTS): correrla dos veces no hace nada.
CREATE TABLE IF NOT EXISTS solicitudes_ajuste (
  id SERIAL PRIMARY KEY,
  lote_id INTEGER NOT NULL REFERENCES lotes(id),
  sucursal_id INTEGER NOT NULL REFERENCES sucursales(id),
  direccion TEXT NOT NULL CHECK (direccion IN ('suma', 'resta')),
  piezas INTEGER NOT NULL CHECK (piezas > 0),
  motivo TEXT NOT NULL CHECK (motivo IN ('error_captura', 'error_conteo', 'mala_instruccion', 'danada', 'otro')),
  comentario TEXT NOT NULL CHECK (char_length(btrim(comentario)) BETWEEN 10 AND 300),
  -- Existencia que había al pedirlo, para que quien autoriza vea de dónde se parte.
  existencia_al_solicitar INTEGER NOT NULL,
  solicitado_por INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  revisado_por INTEGER REFERENCES usuarios(id),
  revisado_en TIMESTAMPTZ,
  comentario_revision TEXT CHECK (comentario_revision IS NULL OR char_length(comentario_revision) <= 300),
  -- Movimiento del ledger que se creó al aprobarla (NULL mientras esté pendiente, rechazada o cancelada).
  movimiento_id BIGINT REFERENCES movimientos_inventario(id),
  -- Un identificador por envío del formulario: si se pulsa dos veces o se reintenta, no se duplica.
  token UUID,
  CONSTRAINT aprobada_tiene_movimiento CHECK (estado <> 'aprobada' OR (movimiento_id IS NOT NULL AND revisado_por IS NOT NULL)),
  CONSTRAINT movimiento_solo_si_aprobada CHECK (estado = 'aprobada' OR movimiento_id IS NULL),
  CONSTRAINT rechazada_tiene_revisor CHECK (estado <> 'rechazada' OR revisado_por IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_ajuste_estado ON solicitudes_ajuste(estado, creado_en);
CREATE INDEX IF NOT EXISTS idx_solicitudes_ajuste_lote ON solicitudes_ajuste(lote_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_ajuste_solicitante ON solicitudes_ajuste(solicitado_por);
-- Cada movimiento pertenece a una sola solicitud, y cada envío del formulario se registra una sola vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitudes_ajuste_movimiento
  ON solicitudes_ajuste(movimiento_id) WHERE movimiento_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitudes_ajuste_token
  ON solicitudes_ajuste(token) WHERE token IS NOT NULL;
