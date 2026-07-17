import { logoutAction } from "@/app/actions";

export default function Header({
  titulo,
  subtitulo,
}: {
  titulo: string;
  subtitulo?: string;
}) {
  return (
    <header className="flex items-center justify-between border-b border-white/10 bg-brand-gray2 px-4 py-3">
      <div>
        <p className="text-lg font-semibold text-brand-gold">{titulo}</p>
        {subtitulo && <p className="text-sm text-brand-cream/70">{subtitulo}</p>}
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded-full border border-white/10 px-4 py-1.5 text-sm text-brand-cream/80 hover:border-brand-gold hover:text-brand-gold"
        >
          Salir
        </button>
      </form>
    </header>
  );
}
