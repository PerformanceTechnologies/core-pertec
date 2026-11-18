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
import EncabezadoAdmin from "@/components/admin/EncabezadoAdmin";
import Avatar from "@/components/admin/Avatar";
import BotonEliminar from "@/components/BotonEliminar";
import { actualizarUsuarioAction, eliminarUsuarioAction } from "../acciones";

/** La ficha de una persona: su acceso se cambia acá, y acá (al final, aparte) se elimina. */
export default async function EditarUsuarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const admin = await exigirAdmin();
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
  const ingreso = usuario.ultimo_ingreso ? `Último ingreso ${haceCuanto(usuario.ultimo_ingreso)}` : "Todavía no ha entrado";

  return (
    <div className="animar-entrada space-y-6">
      <EncabezadoAdmin
        titulo={usuario.nombre || usuario.correo}
        rutaPadre={{ href: "/usuarios", nombre: "Usuarios" }}
        icono={<Avatar nombre={usuario.nombre} correo={usuario.correo} admin={usuario.rol === "admin"} tamano="lg" />}
        descripcion={`${usuario.nombre ? `${usuario.correo} · ` : ""}${ingreso}${usuario.activo ? "" : " · sin acceso"}`}
      />

      {error && (
        <div role="alert" className="max-w-4xl rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          <p className="font-semibold">No se pudieron guardar todos los cambios.</p>
          <p className="mt-0.5">{error}</p>
        </div>
      )}

      <div className={`${TARJETA} max-w-4xl px-5 pt-6 sm:px-7 sm:pt-7`}>
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
              className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-tinta/70 transition hover:bg-tinta/5 hover:text-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-naranjo"
            >
              Cancelar
            </Link>
          }
        />
      </div>

      {usuario.id !== admin.id && (
        <div className="flex max-w-4xl flex-col gap-3 rounded-xl border border-borde px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div>
            <p className="text-sm font-semibold text-tinta">Eliminar usuario</p>
            <p className="text-xs leading-snug text-tinta/60">
              Lo borra junto con sus accesos. Si solo quieres que no entre, apaga «Puede entrar al Core» y guarda.
            </p>
          </div>
          <BotonEliminar
            accion={eliminarUsuarioAction}
            id={usuario.id}
            nombre={usuario.nombre || usuario.correo}
            mensajeConfirmacion={`¿Eliminar a "${usuario.correo}"? Pierde el acceso de inmediato y no se puede deshacer.`}
          />
        </div>
      )}
    </div>
  );
}
