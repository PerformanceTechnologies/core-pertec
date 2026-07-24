import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import BarraLateral from "@/components/BarraLateral";
import BotonSubir from "@/components/BotonSubir";

// Sin caché: cada navegación vuelve a consultar Supabase, así que si el
// admin borra o desactiva a alguien, esa persona queda fuera en la
// siguiente página que cargue, no cuando expire su sesión.
export const dynamic = "force-dynamic";

export default async function LayoutProtegido({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/ingresar");

  const usuario = await obtenerUsuarioActivo(session.user.email);
  if (!usuario) redirect("/ingresar?error=sin_acceso");

  const todasLasApps = await listarAplicaciones();
  const apps =
    usuario.rol === "admin"
      ? todasLasApps
      : todasLasApps.filter((app) => usuario.aplicacionIds.includes(app.id));

  return (
    <div className="lg:flex lg:min-h-screen">
      <BarraLateral correo={usuario.correo} rol={usuario.rol} apps={apps} />
      {/* min-w-0: sin esto, un ítem flex-1 no se achica más allá del ancho
          mínimo de su contenido — si algo adentro es muy ancho (ej. la
          grilla del Gantt de Proyectos, con muchas columnas de día de ancho
          fijo), en vez de scrollear internamente empuja TODO el layout
          (sidebar incluida) más ancho que el viewport. */}
      <main className="min-w-0 flex-1 px-6 py-8 lg:px-10">{children}</main>
      <BotonSubir />
    </div>
  );
}
