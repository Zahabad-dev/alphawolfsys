import Link from "next/link";

const links = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/precios", label: "Precios" },
  { href: "/admin/inventario", label: "Inventario" },
  { href: "/admin/corte", label: "Corte" },
  { href: "/admin/traspasos", label: "Traspasos" },
  { href: "/admin/usuarios", label: "Vendedores" },
  { href: "/admin/sucursales", label: "Sucursales" },
  { href: "/admin/historial", label: "Historial" },
  { href: "/admin/ranking", label: "Ranking" },
  { href: "/soporte", label: "Soporte" },
];

export default function AdminNav() {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-white/10 bg-brand-gray px-4 py-2">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="rounded-full px-3 py-1 text-sm text-brand-cream/70 hover:bg-brand-gray2 hover:text-brand-gold"
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
