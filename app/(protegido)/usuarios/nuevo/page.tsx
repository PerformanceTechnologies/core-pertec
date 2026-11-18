import Link from "next/link";
import { IconArrowLeft, IconUserPlus } from "@tabler/icons-react";
import { exigirAdmin } from "@/lib/autorizacion";
import { listarAplicaciones } from "@/lib/aplicaciones";
import { listarEmpresas } from "@/lib/empresas";
import FormularioUsuario from "@/components/FormularioUsuario";
import { BOTON_SUAVE_C, HOJA, IconoTile } from "@/components/contactos/Visual";
import { crearUsuarioAction } from "../acciones";

export const dynamic = "force-dynamic";

/** Dar de alta a una persona: la misma ficha, vacía. */
export default async function NuevoUsuarioPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await exigirAdmin();
  const { error } = await searchParams;
  const [apps, empresas] = await Promise.all([listarAplicaciones(), listarEmpresas()]);

  return (
    <div className="space-y-5">
      <Link href="/usuarios" className="inline-flex items-center gap-1 rounded-full text-sm font-semibold text-gris transition hover:text-tinta">
        <IconArrowLeft size={16} /> Volver a usuarios
      </Link>

      <header className={`${HOJA} flex items-center gap-4 p-5 sm:p-6`}>
        <IconoTile Icono={IconUserPlus} tono="marca" tamano="grande" />
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-tinta">Nuevo usuario</h2>
          <p className="mt-0.5 text-sm text-gris">Quién es, su rol y a qué entra. Lo puedes cambiar cuando quieras.</p>
        </div>
      </header>

      {error && (
        <section role="alert" className="tono-alerta fondo-tono rounded-2xl px-4 py-3 text-sm">
          <p className="font-bold">No se pudo crear el usuario completo.</p>
          <p className="mt-0.5 text-xs">{error}</p>
        </section>
      )}

      <FormularioUsuario
        accion={crearUsuarioAction}
        todasLasApps={apps}
        todasLasEmpresas={empresas}
        textoBoton="Crear usuario"
        cancelar={<Link href="/usuarios" className={BOTON_SUAVE_C}>Cancelar</Link>}
      />
    </div>
  );
}
