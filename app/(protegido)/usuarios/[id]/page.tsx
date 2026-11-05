import { notFound } from "next/navigation";
import Link from "next/link";
import { exigirAdmin } from "@/lib/autorizacion";
import { obtenerUsuarioPorId } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import { obtenerSubpanelesFinanzasGuardados } from "@/lib/finanzas-subpaneles-usuario";
import { empresaIdsDeUsuario, listarEmpresas } from "@/lib/empresas";
import { haceCuanto } from "@/lib/modulos-resumen-modelo";
import { TARJETA } from "@/lib/estilos";
import FormularioUsuario from "@/components/FormularioUsuario";
import Avatar from "@/components/admin/Avatar";
import EncabezadoAdmin from "@/components/admin/EncabezadoAdmin";
import { actualizarUsuarioAction } from "../acciones";

export default async function EditarUsuarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await exigirAdmin();
  const { id } = await params;
  const { error } = await searchParams;
  const [usuario, apps, subpanelesFinanzasAsignados, empresas, empresasAsignadas] = await Promise.all([
    obtenerUsuarioPorId(id),
    listarAplicaciones(),
    obtenerSubpanelesFinanzasGuardados(id),
    listarEmpresas(),
    empresaIdsDeUsuario(id),
  ]);
  if (!usuario) notFound();

  const accionConId = actualizarUsuarioAction.bind(null, id);
  const esAdmin = usuario.rol === "admin";

  return (
    <div className="animar-entrada space-y-6">
      <EncabezadoAdmin
        titulo={usuario.nombre || usuario.correo}
        rutaPadre={{ href: "/usuarios", nombre: "Usuarios" }}
        descripcion="Cambia el rol, las aplicaciones y las empresas de esta persona. Los cambios valen desde su próxima página."
      />

      {error && (
        <div role="alert" className="max-w-3xl rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          <p className="font-semibold">No se pudieron guardar todos los cambios.</p>
          <p className="mt-0.5">{error}</p>
        </div>
      )}

      <div className={`${TARJETA} max-w-3xl p-6 sm:p-7`}>
        <div className="mb-7 flex flex-wrap items-center gap-4 border-b border-borde pb-6">
          <Avatar nombre={usuario.nombre} correo={usuario.correo} admin={esAdmin} tamano="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-tinta">{usuario.nombre || usuario.correo}</p>
            {usuario.nombre && <p className="truncate text-sm text-tinta/65">{usuario.correo}</p>}
            <p className="mt-1 text-xs text-tinta/60">
              {usuario.activo ? "Cuenta activa" : "Cuenta inactiva"} ·{" "}
              {usuario.ultimo_ingreso ? `último ingreso ${haceCuanto(usuario.ultimo_ingreso)}` : "todavía no ha entrado"}
            </p>
          </div>
        </div>

        <FormularioUsuario
          accion={accionConId}
          todasLasApps={apps}
          todasLasEmpresas={empresas}
          empresasAsignadas={empresasAsignadas}
          valoresPorDefecto={usuario}
          subpanelesFinanzasAsignados={subpanelesFinanzasAsignados}
          textoBoton="Guardar cambios"
          correoBloqueado
          cancelar={
            <Link
              href="/usuarios"
              className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-tinta/70 transition hover:bg-tinta/5 hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-naranjo"
            >
              Cancelar
            </Link>
          }
        />
      </div>
    </div>
  );
}
