import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import type { Rol } from "@/types/next-auth";

interface UsuarioRow {
  id: number;
  username: string;
  password_hash: string;
  nombre: string;
  rol: Rol;
  sucursal_id: number | null;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Usuario" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize: async (credentials) => {
        const username = credentials?.username;
        const password = credentials?.password;
        if (typeof username !== "string" || typeof password !== "string") {
          return null;
        }

        const { rows } = await query<UsuarioRow>(
          "SELECT id, username, password_hash, nombre, rol, sucursal_id FROM usuarios WHERE username = $1 AND activo = true",
          [username]
        );
        const user = rows[0];
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;

        return {
          id: String(user.id),
          name: user.nombre,
          email: user.username,
          rol: user.rol,
          sucursalId: user.sucursal_id,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.rol = user.rol;
        token.sucursalId = user.sucursalId;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.rol = token.rol as Rol;
        session.user.sucursalId = token.sucursalId as number | null;
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
});
