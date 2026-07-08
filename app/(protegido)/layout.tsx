import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import BarraLateral from "@/components/BarraLateral";

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
      <main className="flex-1 px-6 py-8 lg:px-10">{children}</main>
    </div>
  );
}
