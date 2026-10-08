import type { Rol } from "@/types/next-auth";

/**
 * Política de permisos en un solo lugar.
 *
 * - Gerente: maneja casi todo como el administrador (precios, sucursales,
 *   usuarios, contraseñas, ajustes de inventario, traspasos, cortes…).
 * - Lo ÚNICO que el gerente no puede hacer: eliminar vendedores ni eliminar
 *   sucursales (decisión del cliente). Eso queda solo para el administrador.
 */

/** Administrador o gerente: puede crear/editar/gestionar. */
export function puedeGestionar(rol: Rol | undefined): boolean {
  return rol === "admin" || rol === "gerente";
}

/** Solo administrador: eliminar vendedores y eliminar sucursales. */
export function esAdmin(rol: Rol | undefined): boolean {
  return rol === "admin";
}
