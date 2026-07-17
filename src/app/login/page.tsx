"use client";

import Image from "next/image";
import { useActionState } from "react";
import { loginAction } from "@/app/actions";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-brand-black px-6">
      <Image
        src="/brand/wolf-logo.png"
        alt="Wolf Daniel's"
        width={80}
        height={80}
        className="h-20 w-auto object-contain"
        priority
      />
      <h1 className="text-center text-2xl text-brand-gold">Wolf Daniels</h1>

      <form
        action={formAction}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-white/10 bg-brand-gray2 p-8"
      >
        <h2 className="text-center text-xl text-brand-cream">
          Inventario y ventas
        </h2>

        <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
          Usuario
          <input
            name="username"
            type="text"
            required
            autoComplete="username"
            className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-brand-cream/80">
          Contraseña
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-lg border border-white/10 bg-brand-black px-3 py-2 text-brand-cream outline-none focus:border-brand-gold"
          />
        </label>

        {error && <p className="text-sm text-brand-red">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-full bg-brand-gold px-6 py-2 font-semibold text-brand-black transition-opacity disabled:opacity-60"
        >
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
