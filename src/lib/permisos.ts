import type { Rol } from "@/types/next-auth";

/**
 * Política de permisos en un solo lugar.
 *
 * - "Administración" = administrador + soporte: poder total sobre el panel. Soporte tiene la
 *   misma vista y los mismos poderes que el administrador para poder ejecutar cambios cuando
 *   el dueño no está.
 * - Gerente: gestiona casi todo (precios, sucursales, usuarios, contraseñas, traspasos, cortes…).
 *   NO puede lo más delicado: eliminar vendedores ni sucursales, ni hacer ajustes de inventario.
 * - Vendedor: solo vende y consulta el inventario de su sucursal.
 */

/** Nombre del rol para mostrarlo en pantalla (la barra de arriba dice con quién se está trabajando). */
export function etiquetaRol(rol: Rol | undefined): string {
  switch (rol) {
    case "admin":
      return "Administrador";
    case "gerente":
      return "Gerente";
    case "soporte":
      return "Soporte";
    case "vendedor":
      return "Vendedor";
    default:
      return "";
  }
}

/** Administración (administrador o soporte): eliminar vendedores/sucursales y ajustes de inventario. */
export function esAdmin(rol: Rol | undefined): boolean {
  return rol === "admin" || rol === "soporte";
}

/** Administración o gerente: puede crear/editar/gestionar. */
export function puedeGestionar(rol: Rol | undefined): boolean {
  return rol === "admin" || rol === "gerente" || rol === "soporte";
}
