import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { obtenerUsuarioActivo, registrarIngreso } from "@/lib/usuarios";

// Token endpoint del mismo tenant/App Registration que ya usa
// AUTH_MICROSOFT_ENTRA_ID_ISSUER (formato ".../<tenant-id>/v2.0"), para
// refrescar el access token cuando expira (ver callback jwt).
function endpointToken(): string {
  const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER!;
  return `${issuer.replace(/\/v2\.0\/?$/, "")}/oauth2/v2.0/token`;
}

async function refrescarAccessToken(token: import("next-auth/jwt").JWT) {
  try {
    if (!token.refreshToken) throw new Error("Sin refresh token");

    const respuesta = await fetch(endpointToken(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
        client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
        scope: "openid profile email offline_access User.Read Calendars.Read",
      }),
    });

    const datos = await respuesta.json();
    if (!respuesta.ok) throw datos;

    return {
      ...token,
      accessToken: datos.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + datos.expires_in,
      // Microsoft rota el refresh token en cada uso; si no viene uno nuevo,
      // el anterior sigue siendo válido y hay que conservarlo.
      refreshToken: datos.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.error("No fue posible refrescar el access token de Microsoft", error);
    return { ...token, error: "RefreshAccessTokenError" as const };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      // Calendars.Read es opcional en la práctica: si el usuario lo rechaza
      // (o el tenant aún no dio consentimiento de administrador), el login
      // igual funciona -- el widget de calendario del dashboard simplemente
      // muestra un estado "conecta tu calendario" (ver lib/graph-calendario.ts).
      authorization: {
        params: { scope: "openid profile email offline_access User.Read Calendars.Read" },
      },
    }),
  ],
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
    async jwt({ token, account, profile }) {
      // Primer login: "account" trae los tokens que devolvió Microsoft.
      if (account) {
        // Se captura el ultimo_ingreso ANTERIOR antes de que registrarIngreso
        // lo sobreescriba con el de ahora mismo (ver lib/usuarios.ts) -- así
        // el dashboard puede mostrar "tu último ingreso fue...".
        const ultimoIngresoAnterior = profile?.email ? await registrarIngreso(profile.email) : null;

        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          ultimoIngresoAnterior,
          error: undefined,
        };
      }

      // Sin refresh_token (usuario rechazó el permiso, o el tenant no lo
      // entregó): no hay nada que refrescar, el widget de calendario queda
      // deshabilitado silenciosamente.
      if (!token.refreshToken) return token;

      // Token todavía vigente (con 60s de margen).
      if (token.expiresAt && Date.now() < (token.expiresAt - 60) * 1000) {
        return token;
      }

      return refrescarAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.calendarError = token.error;
      session.ultimoIngresoAnterior = token.ultimoIngresoAnterior;
      return session;
    },
  },
});
