import Link from "next/link";
import { auth } from "@/auth";
import { etiquetaRol } from "@/lib/permisos";

const links = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/precios", label: "Precios" },
  { href: "/admin/modelos", label: "Modelos" },
  { href: "/admin/inventario", label: "Inventario" },
  { href: "/admin/corte", label: "Corte" },
  { href: "/admin/traspasos", label: "Traspasos" },
  { href: "/admin/ajustes", label: "Ajustes" },
  { href: "/admin/usuarios", label: "Vendedores" },
  { href: "/admin/sucursales", label: "Sucursales" },
  { href: "/admin/historial", label: "Historial" },
  { href: "/admin/ranking", label: "Ranking" },
  { href: "/soporte", label: "Soporte" },
];

export default async function AdminNav() {
  // Quién tiene la sesión abierta: en una tablet compartida, saber con qué usuario se está
  // trabajando evita registrar cosas a nombre de otra persona.
  const session = await auth();
  const nombre = session?.user?.name;
  const rol = etiquetaRol(session?.user?.rol);

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-white/10 bg-brand-gray px-4 py-2">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="rounded-full px-3 py-1 text-sm text-brand-cream/70 hover:bg-brand-gray2 hover:text-brand-gold"
        >
          {l.label}
        </Link>
      ))}
      {nombre && (
        <p
          className="ml-auto rounded-full border border-brand-gold/40 bg-brand-gold/10 px-3 py-1 text-sm text-brand-cream"
          title="Usuario con la sesión abierta"
        >
          <span className="text-brand-cream/70">Sesión: </span>
          <strong className="text-brand-gold">{nombre}</strong>
          {rol && <span className="text-brand-cream/70"> · {rol}</span>}
        </p>
      )}
    </nav>
  );
}
