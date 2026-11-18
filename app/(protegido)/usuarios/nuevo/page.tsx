import Link from "next/link";
import { exigirAdmin } from "@/lib/autorizacion";
import { listarAplicaciones } from "@/lib/aplicaciones";
import { listarEmpresas } from "@/lib/empresas";
import { TARJETA } from "@/lib/estilos";
import FormularioUsuario from "@/components/FormularioUsuario";
import EncabezadoAdmin from "@/components/admin/EncabezadoAdmin";
import { crearUsuarioAction } from "../acciones";

export const dynamic = "force-dynamic";

/** Dar de alta a una persona: el mismo formulario que su ficha, vacío. */
export default async function NuevoUsuarioPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await exigirAdmin();
  const { error } = await searchParams;
  const [apps, empresas] = await Promise.all([listarAplicaciones(), listarEmpresas()]);

  return (
    <div className="animar-entrada space-y-6">
      <EncabezadoAdmin
        titulo="Nuevo usuario"
        rutaPadre={{ href: "/usuarios", nombre: "Usuarios" }}
        descripcion="Su correo, su rol y a qué entra. Lo puedes cambiar cuando quieras."
      />

      {error && (
        <div role="alert" className="max-w-4xl rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          <p className="font-semibold">No se pudo crear el usuario completo.</p>
          <p className="mt-0.5">{error}</p>
        </div>
      )}

      <div className={`${TARJETA} max-w-4xl px-5 pt-6 sm:px-7 sm:pt-7`}>
        <FormularioUsuario
          accion={crearUsuarioAction}
          todasLasApps={apps}
          todasLasEmpresas={empresas}
          textoBoton="Crear usuario"
          cancelar={<Cancelar />}
        />
      </div>
    </div>
  );
}

function Cancelar() {
  return (
    <Link href="/usuarios" className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-tinta/70 transition hover:bg-tinta/5 hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-naranjo">
      Cancelar
    </Link>
  );
}
