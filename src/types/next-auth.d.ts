import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    rol: "admin" | "vendedor";
    sucursalId: number | null;
  }

  interface Session {
    user: {
      id: string;
      rol: "admin" | "vendedor";
      sucursalId: number | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    rol?: "admin" | "vendedor";
    sucursalId?: number | null;
  }
}
