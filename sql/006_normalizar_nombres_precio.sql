-- Ya no se usan nombres libres para los precios (evita confusiones tipo "Lote AB").
-- Normaliza los nombres existentes para que coincidan con su precio.
UPDATE lotes SET nombre = '$' || to_char(precio_mxn, 'FM999999990.00');
