-- Nuevo rol intermedio "gerente": puede operar el día a día (ver todo,
-- registrar cortes/traspasos, asignar/ajustar precios, activar/desactivar)
-- pero no puede crear/eliminar sucursales, ni eliminar vendedores o precios,
-- ni crear otras cuentas. Esas acciones siguen siendo exclusivas de 'admin'.
ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('admin', 'gerente', 'vendedor'));

ALTER TABLE usuarios DROP CONSTRAINT vendedor_requiere_sucursal;
ALTER TABLE usuarios ADD CONSTRAINT vendedor_requiere_sucursal
  CHECK (rol IN ('admin', 'gerente') OR sucursal_id IS NOT NULL);
