import { auth } from "@/auth";

/** Admin o gerente: pueden entrar al panel y operar el día a día. */
export async function requireStaff() {
  const session = await auth();
  if (!session || session.user.rol === "vendedor") {
    throw new Error("No autorizado");
  }
  return session;
}

/** Solo admin: crear/eliminar sucursales, vendedores, precios y otras cuentas. */
export async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.rol !== "admin") {
    throw new Error("No autorizado");
  }
  return session;
}
