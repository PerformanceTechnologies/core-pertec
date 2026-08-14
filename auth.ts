import NextAuth, { type Profile } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { obtenerUsuarioActivo, registrarIngreso } from "@/lib/usuarios";
import { canjearRefreshToken, SCOPES_GRAPH } from "@/lib/graph-token";
import { guardarRefreshToken } from "@/lib/graph-credenciales";

// El canje contra Entra vive en lib/graph-token.ts porque el cron del resumen
// diario lo necesita igual, sin sesión de por medio, y los scopes de los dos
// tienen que ser idénticos (ver el comentario de ese archivo).
async function refrescarAccessToken(token: import("next-auth/jwt").JWT) {
  try {
    if (!token.refreshToken) throw new Error("Sin refresh token");
    const tokens = await canjearRefreshToken(token.refreshToken);

    // El refresh token rotado también se guarda en la base: si no, el cron se
    // quedaría con uno que Microsoft ya invalidó al rotarlo acá.
    if (tokens.refreshToken && token.email) {
      await guardarRefreshToken(token.email, tokens.refreshToken);
    }

    return {
      ...token,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiraEn,
      // Microsoft rota el refresh token en cada uso; si no viene uno nuevo,
      // el anterior sigue siendo válido y hay que conservarlo.
      refreshToken: tokens.refreshToken ?? token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.error("No fue posible refrescar el access token de Microsoft", error);
    return { ...token, error: "RefreshAccessTokenError" as const };
  }
}

/**
 * El correo con el que se busca a la persona en la tabla `usuarios`.
 *
 * El provider de Entra mapea `email: profile.email` y nada más (ver
 * @auth/core/providers/microsoft-entra-id.js). Ese claim sale del atributo `mail`
 * del directorio, y si una cuenta no lo tiene poblado llega vacío: entonces la
 * búsqueda se hacía con undefined, no encontraba a nadie, y el login terminaba
 * en "Tu cuenta no está autorizada" aunque la persona estuviera cargada y activa.
 *
 * De ahí el respaldo a preferred_username y upn, que en Entra son el nombre de
 * inicio de sesión. No abre ninguna puerta: el valor solo sirve para BUSCAR en
 * `usuarios`, así que si no corresponde a alguien cargado y activo, el acceso se
 * niega igual.
 */
function correoDelPerfil(perfil: Profile | undefined): string | null {
  const claims = perfil as (Profile & { preferred_username?: string; upn?: string }) | undefined;
  const candidato = claims?.email || claims?.preferred_username || claims?.upn;
  return candidato ? candidato.toLowerCase() : null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      // Calendars.Read, Mail.Read y Mail.Send son opcionales en la práctica: si
      // el usuario los rechaza (o el tenant aún no dio consentimiento de
      // administrador), el login igual funciona -- el widget de calendario y el
      // resumen diario muestran un estado "conectá tu cuenta" en vez de caerse
      // (ver lib/graph-calendario.ts y lib/graph-correo.ts).
      authorization: { params: { scope: SCOPES_GRAPH } },
    }),
  ],
  // Treinta días, y la cookie se corre una vez por día de uso.
  //
  // Antes eran 8 horas SIN renovación: `updateAge` por defecto son 24 h (ver
  // @auth/core/lib/init.js), o sea más que la vida de la sesión, así que la
  // cookie nunca alcanzaba a renovarse y a las 8 horas del login sacaba a la
  // persona aunque estuviera trabajando. Entrando a las 8:00, login de nuevo a
  // las 16:00, en medio de la jornada.
  //
  // Una sesión larga no le da acceso extra a nadie: el core no confía en la
  // sesión para los permisos, vuelve a leer de la base quién es, si está activo
  // y qué apps tiene en CADA carga de página (ver app/(protegido)/layout.tsx y
  // su force-dynamic). Desactivar a alguien en Usuarios lo deja afuera en la
  // página siguiente, tenga la sesión que tenga.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  pages: { signIn: "/ingresar" },
  callbacks: {
    // Solo decide si puede ENTRAR. El rol y las apps asignadas se leen frescos
    // en cada carga de página (ver app/(protegido)/layout.tsx) para que quitar
    // acceso a alguien tenga efecto de inmediato, no recién cuando expire su sesión.
    async signIn({ profile }) {
      const correo = correoDelPerfil(profile);
      const usuario = await obtenerUsuarioActivo(correo);
      if (!usuario) {
        // Un rechazo no dejaba ningún rastro: la persona veía "no autorizada" y
        // del lado del servidor no había con qué saber con qué correo entró. Sin
        // esto, averiguar por qué a alguien no lo deja pasar es adivinar.
        console.warn(
          `[auth] Login rechazado. correo=${correo ?? "(el perfil de Entra no trajo ninguno)"} ` +
            `claims=${Object.keys(profile ?? {}).join(",")}`,
        );
        return false;
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      // Primer login: "account" trae los tokens que devolvió Microsoft.
      if (account) {
        // Se captura el ultimo_ingreso ANTERIOR antes de que registrarIngreso
        // lo sobreescriba con el de ahora mismo (ver lib/usuarios.ts) -- así
        // el dashboard puede mostrar "tu último ingreso fue...".
        const correo = correoDelPerfil(profile);
        const ultimoIngresoAnterior = correo ? await registrarIngreso(correo) : null;

        // El refresh token se persiste cifrado para que el cron de las 7:30
        // pueda leer el correo en nombre de la persona. Es la alternativa a
        // pedir permisos de APLICACIÓN, que darían acceso a todos los buzones
        // del tenant en vez de solo al de quien se logueó. Si falla, el login
        // no se rompe: el resumen diario simplemente no se genera solo.
        if (account.refresh_token && correo) {
          await guardarRefreshToken(correo, account.refresh_token).catch((e) =>
            console.error("[auth] No se pudo guardar el refresh token de Graph:", e),
          );
        }

        return {
          ...token,
          // El correo va al token explícitamente: refrescarAccessToken lo usa
          // para volver a guardar el refresh token rotado, y si el claim `email`
          // vino vacío el token quedaba sin él y esa persona perdía el correo
          // diario sin ninguna señal.
          email: correo ?? token.email,
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
