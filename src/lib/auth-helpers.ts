import { auth } from "@/auth";
import { esAdmin } from "@/lib/permisos";

/** Administración o gerente: pueden entrar al panel y operar el día a día. */
export async function requireStaff() {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") {
    throw new Error("No autorizado");
  }
  return session;
}

/** Solo administración (administrador o soporte): eliminar sucursales, vendedores y otras cuentas. */
export async function requireAdmin() {
  const session = await auth();
  if (!session || !esAdmin(session.user.rol)) {
    throw new Error("No autorizado");
  }
  return session;
}
