import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { obtenerUsuarioActivo } from "@/lib/usuarios";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [MicrosoftEntraID],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/ingresar" },
  callbacks: {
    // Solo decide si puede ENTRAR. El rol y las apps asignadas se leen frescos
    // en cada carga de página (ver app/(protegido)/layout.tsx) para que quitar
    // acceso a alguien tenga efecto de inmediato, no recién cuando expire su sesión.
    async signIn({ profile }) {
      const usuario = await obtenerUsuarioActivo(profile?.email);
      return usuario !== null;
    },
  },
});
