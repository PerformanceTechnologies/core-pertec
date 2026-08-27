import Link from "next/link";
import { exigirAccesoOfertas, listarOfertas } from "@/lib/ofertas/datos";
import { listarUsuarios } from "@/lib/usuarios";
import SubirBorrador from "@/components/ofertas/SubirBorrador";
import TablaOfertas from "@/components/ofertas/TablaOfertas";

export const dynamic = "force-dynamic";

/**
 * El listado: las ofertas de quien mira, y todas si es admin.
 *
 * `listarOfertas` recibe el usuario justamente para que el filtro no se pueda omitir
 * acá por descuido — ver su comentario en lib/ofertas/datos.ts.
 */
export default async function OfertasPage() {
  const usuario = await exigirAccesoOfertas();
  const ofertas = await listarOfertas(usuario);

  // Los nombres se piden solo para el admin: es el único listado con ofertas de
  // varias personas, y por lo tanto el único donde saber de quién es cada una agrega
  // algo (y donde se puede buscar por autor).
  const autores: Record<string, string> = {};
  if (usuario.rol === "admin") {
    for (const u of await listarUsuarios()) autores[u.id] = u.nombre ?? u.correo;
  }

  return (
    <div className="animar-entrada max-w-[1200px]">
      <Link
        href="/"
        className="text-xs font-medium text-tinta/50 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
      >
        ← Volver al inicio
      </Link>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <span className="etiqueta-seccion">Ofertas técnicas</span>
          <h1 className="mt-2 max-w-[26ch] font-condensed text-3xl font-bold uppercase leading-[0.95] tracking-tight text-tinta sm:text-4xl">
            Ofertas técnicas
            <span className="block text-tinta/40">Del borrador al formato de la casa</span>
          </h1>
        </div>
        <div className="flex items-center gap-4 lg:shrink-0">
          <Link
            href="/ofertas/logos"
            className="text-xs font-medium text-tinta/55 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
          >
            Logos →
          </Link>
          <Link
            href="/ofertas/maestros"
            className="text-xs font-medium text-tinta/55 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
          >
            Maestros de formato →
          </Link>
        </div>
      </div>

      <SubirBorrador />

      {ofertas.length === 0 ? (
        <p className="mt-8 text-sm text-tinta/50">Todavía no hay ofertas. Subí un borrador para empezar.</p>
      ) : (
        <TablaOfertas ofertas={ofertas} autores={autores} />
      )}
    </div>
  );
}
