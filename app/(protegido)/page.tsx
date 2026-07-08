import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import CartillaApp from "@/components/CartillaApp";

export default async function CatalogoPage() {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario) return null; // el layout ya redirige antes de llegar aquí

  const todasLasApps = await listarAplicaciones();
  const apps =
    usuario.rol === "admin"
      ? todasLasApps
      : todasLasApps.filter((app) => usuario.aplicacionIds.includes(app.id));

  return (
    <div>
      <span className="etiqueta-seccion">Tus aplicaciones</span>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">
        Catálogo de herramientas
      </h1>

      {apps.length === 0 ? (
        <p className="mt-6 text-sm text-tinta/60">
          Todavía no tienes aplicaciones asignadas. Pídele a un administrador que te dé acceso.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {apps.map((app) => (
            <CartillaApp key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}
