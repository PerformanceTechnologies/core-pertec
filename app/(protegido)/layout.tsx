import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import BarraLateral from "@/components/BarraLateral";
import { HUECO_DE_BARRA } from "@/lib/estilos";
import BotonSubir from "@/components/BotonSubir";

// Sin caché: cada navegación vuelve a consultar Supabase, así que si el
// admin borra o desactiva a alguien, esa persona queda fuera en la
// siguiente página que cargue, no cuando expire su sesión.
export const dynamic = "force-dynamic";

export default async function LayoutProtegido({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/ingresar");

  // El catalogo de aplicaciones no depende de quien sea el usuario: se pide al
  // mismo tiempo y no despues. Encadenadas eran dos viajes a Supabase seguidos
  // en el camino critico de toda pagina protegida.
  const promesaApps = listarAplicaciones();

  const usuario = await obtenerUsuarioActivo(session.user.email);
  if (!usuario) redirect("/ingresar?error=sin_acceso");

  const todasLasApps = await promesaApps;
  const apps =
    usuario.rol === "admin"
      ? todasLasApps
      : todasLasApps.filter((app) => usuario.aplicacionIds.includes(app.id));

  return (
    <div className="min-h-screen">
      <BarraLateral correo={usuario.correo} rol={usuario.rol} apps={apps} />
      {/* La barra es FIJA (sale del flujo), así que el hueco se lo deja el
          contenido con un padding: ver BARRA_FIJA / HUECO_DE_BARRA en
          lib/estilos.ts, donde está el porqué. Antes eran dos ítems flex y la
          barra era `sticky`, que se descuadraba al llegar al fondo de las
          páginas con popovers.

          min-w-0 sigue haciendo falta: si algo adentro es muy ancho (la grilla
          del Gantt de Proyectos, con muchas columnas de día de ancho fijo), sin
          esto no scrollea internamente y empuja el layout más ancho que el
          viewport. */}
      <main className={`min-w-0 px-6 py-8 lg:px-10 ${HUECO_DE_BARRA}`}>{children}</main>
      <BotonSubir />
    </div>
  );
}
