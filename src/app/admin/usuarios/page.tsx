import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import AdminNav from "@/components/AdminNav";
import NuevoVendedorForm from "./nuevo-vendedor-form";
import SucursalSelect from "./sucursal-select";
import { toggleUsuarioActivoAction } from "./actions";

interface UsuarioRow {
  id: number;
  username: string;
  nombre: string;
  rol: "admin" | "vendedor";
  sucursal_id: number | null;
  sucursal_nombre: string | null;
  activo: boolean;
}

interface SucursalRow {
  id: number;
  nombre: string;
}

export default async function AdminUsuariosPage() {
  const session = await auth();
  if (!session || session.user.rol !== "admin") redirect("/login");

  const [{ rows: usuarios }, { rows: sucursales }] = await Promise.all([
    query<UsuarioRow>(
      `SELECT u.id, u.username, u.nombre, u.rol, u.sucursal_id, s.nombre AS sucursal_nombre, u.activo
       FROM usuarios u
       LEFT JOIN sucursales s ON s.id = u.sucursal_id
       ORDER BY u.rol, s.nombre NULLS FIRST, u.nombre`
    ),
    query<SucursalRow>("SELECT id, nombre FROM sucursales WHERE activa = true ORDER BY nombre"),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Vendedores" subtitulo="Gestión de usuarios" />
      <AdminNav />
      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
        <NuevoVendedorForm sucursales={sucursales} />

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-gray2 text-brand-cream/70">
              <tr>
                <th className="px-4 py-2">Usuario</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Rol</th>
                <th className="px-4 py-2">Sucursal</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-white/10">
                  <td className="px-4 py-2">{u.username}</td>
                  <td className="px-4 py-2">{u.nombre}</td>
                  <td className="px-4 py-2 capitalize">{u.rol}</td>
                  <td className="px-4 py-2">
                    {u.rol === "vendedor" ? (
                      <SucursalSelect
                        usuarioId={u.id}
                        sucursalIdActual={u.sucursal_id ?? 0}
                        sucursales={sucursales}
                      />
                    ) : (
                      <span className="text-brand-cream/50">Todas</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {u.activo ? (
                      <span className="text-brand-green">Activo</span>
                    ) : (
                      <span className="text-brand-cream/50">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {u.rol === "vendedor" && (
                      <form action={toggleUsuarioActivoAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="activo" value={String(u.activo)} />
                        <button
                          type="submit"
                          className="text-sm text-brand-cream/70 underline hover:text-brand-gold"
                        >
                          {u.activo ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
