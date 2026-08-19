import type { DefaultSession } from "next-auth";

export type Rol = "admin" | "gerente" | "vendedor" | "soporte";

declare module "next-auth" {
  interface User {
    rol: Rol;
    sucursalId: number | null;
  }

  interface Session {
    user: {
      id: string;
      rol: Rol;
      sucursalId: number | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    rol?: Rol;
    sucursalId?: number | null;
  }
}
