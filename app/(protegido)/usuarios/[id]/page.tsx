import { notFound } from "next/navigation";
import Link from "next/link";
import { IconAlertTriangle, IconArrowLeft, IconCircleCheck, IconShieldCheck } from "@tabler/icons-react";
import { exigirAdmin } from "@/lib/autorizacion";
import { obtenerUsuarioPorId } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import { obtenerSubpanelesFinanzasGuardados } from "@/lib/finanzas-subpaneles-usuario";
import { empresaIdsDeUsuario, listarEmpresas } from "@/lib/empresas";
import { SLUG_POR_OMISION } from "@/lib/empresas-modelo";
import { appsAsignadasVigentes } from "@/lib/administracion-modelo";
import { haceCuanto } from "@/lib/modulos-resumen-modelo";
import FormularioUsuario from "@/components/FormularioUsuario";
import DistintivoEmpresa from "@/components/DistintivoEmpresa";
import EliminarUsuario from "@/components/admin/EliminarUsuario";
import { AvatarUsuario, CHIP } from "@/components/admin/VisualUsuarios";
import { BOTON_SUAVE_C, HOJA } from "@/components/contactos/Visual";
import { actualizarUsuarioAction, eliminarUsuarioAction } from "../acciones";

/** La ficha de una persona, con la forma de la de un contacto: cabecera, estado y el formulario en tarjetas. */
export default async function EditarUsuarioPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
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

  const esAdmin = usuario.rol === "admin";
  const invitado = usuario.tipo === "invitado";
  const nApps = appsAsignadasVigentes(usuario, new Set(apps.map((a) => a.id)));
  const suyas = empresas.filter((e) => empresasAsignadas.includes(e.id));
  const susEmpresas = suyas.length > 0 ? suyas : empresas.filter((e) => e.slug === SLUG_POR_OMISION);
  const ingreso = usuario.ultimo_ingreso ? `último ingreso ${haceCuanto(usuario.ultimo_ingreso)}` : "todavía no ha entrado";

  return (
    <div className="space-y-5">
      <Link href="/usuarios" className="inline-flex items-center gap-1 rounded-full text-sm font-semibold text-gris transition hover:text-tinta">
        <IconArrowLeft size={16} /> Volver a usuarios
      </Link>

      {/* ── Cabecera ── */}
      <header className={`${HOJA} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-start gap-4 sm:gap-5">
          <AvatarUsuario nombre={usuario.nombre} correo={usuario.correo} tipo={esAdmin ? "admin" : invitado ? "invitado" : "usuario"} grande />
          <div className="min-w-0 flex-1">
            {usuario.nombre && <span className="break-all text-xs text-gris">{usuario.correo}</span>}
            <h2 className="mt-0.5 break-words text-2xl font-extrabold leading-tight tracking-tight text-tinta sm:text-[28px]">{usuario.nombre || usuario.correo}</h2>
            <p className="mt-1 text-sm text-gris">{[invitado ? "Invitado externo" : "De PERTEC", ingreso].join(" · ")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {esAdmin ? (
                <span className={`${CHIP} bg-naranjo/12 text-naranjo`}><IconShieldCheck size={12} /> Administrador</span>
              ) : (
                <span className={`${CHIP} bg-tinta/[0.06] text-tinta`}>Usuario · {nApps} {nApps === 1 ? "aplicación" : "aplicaciones"}</span>
              )}
              {invitado && <span className={`${CHIP} bg-violet-500/15 text-tinta`}>Invitado</span>}
              {usuario.id === admin.id && <span className={`${CHIP} bg-tinta/[0.06] text-gris`}>Tú</span>}
              {/* Sus empresas, con su logo. */}
              {!esAdmin &&
                susEmpresas.map((e) => (
                  <span key={e.id} className={`${CHIP} bg-tinta/[0.04] py-0.5 pl-1 text-tinta ${suyas.length === 0 ? "opacity-60" : ""}`} title={suyas.length === 0 ? "Por omisión: no tiene ninguna marcada" : undefined}>
                    <DistintivoEmpresa empresa={e} /> {e.nombre}
                  </span>
                ))}
            </div>
          </div>
          {/* En celular va en su propia línea, para no apretar el nombre. */}
          {usuario.id !== admin.id && (
            <div className="w-full sm:w-auto">
              <EliminarUsuario accion={eliminarUsuarioAction} id={usuario.id} correo={usuario.correo} />
            </div>
          )}
        </div>
      </header>

      {/* ── ¿Puede trabajar? ── */}
      {!usuario.activo ? (
        <Estado tono="aviso" titulo="No puede entrar al Core" detalle="Prende «Puede entrar al Core» y guarda para devolverle el acceso." />
      ) : esAdmin ? (
        <Estado tono="ok" titulo="Entra a todo" detalle="Como administrador ve todas las aplicaciones y empresas." />
      ) : nApps === 0 ? (
        <Estado tono="aviso" titulo="Entra al Core, pero no ve ninguna aplicación" detalle="Márcale al menos una en Aplicaciones." />
      ) : (
        <Estado tono="ok" titulo="Puede trabajar" detalle={`Ve ${nApps} ${nApps === 1 ? "aplicación" : "aplicaciones"} en ${susEmpresas.map((e) => e.nombre).join(", ")}.`} />
      )}

      {error && (
        <section role="alert" className="tono-alerta fondo-tono rounded-2xl px-4 py-3 text-sm">
          <p className="font-bold">No se pudieron guardar todos los cambios.</p>
          <p className="mt-0.5 text-xs">{error}</p>
        </section>
      )}

      <FormularioUsuario
        accion={actualizarUsuarioAction.bind(null, id)}
        todasLasApps={apps}
        todasLasEmpresas={empresas}
        empresasAsignadas={empresasAsignadas}
        valoresPorDefecto={usuario}
        subpanelesFinanzasAsignados={subpanelesFinanzasAsignados}
        textoBoton="Guardar cambios"
        correoBloqueado
        cancelar={<Link href="/usuarios" className={BOTON_SUAVE_C}>Cancelar</Link>}
      />
    </div>
  );
}

function Estado({ tono, titulo, detalle }: { tono: "ok" | "aviso"; titulo: string; detalle: string }) {
  const Icono = tono === "ok" ? IconCircleCheck : IconAlertTriangle;
  return (
    <section className={`${tono === "ok" ? "tono-ok" : "tono-aviso"} fondo-tono flex items-center gap-3 rounded-2xl px-4 py-3`}>
      <Icono size={20} stroke={2} className="shrink-0" />
      <p className="text-sm font-bold">
        {titulo}
        <span className="ml-2 text-xs font-semibold opacity-80">· {detalle}</span>
      </p>
    </section>
  );
}
