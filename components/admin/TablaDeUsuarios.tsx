import Link from "next/link";
import { IconClock, IconPencil, IconShieldCheck, IconUserOff } from "@tabler/icons-react";
import { appsAsignadasVigentes } from "@/lib/administracion-modelo";
import { haceCuanto } from "@/lib/modulos-resumen-modelo";
import { TARJETA } from "@/lib/estilos";
import type { Empresa } from "@/lib/empresas-modelo";
import type { UsuarioConAcceso } from "@/lib/tipos";
import BotonEliminar from "@/components/BotonEliminar";
import Avatar from "@/components/admin/Avatar";

const CELDA = "px-4 py-3 align-middle";
const CABECERA = "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-tinta/65";

/**
 * La tabla de personas de Administración > Usuarios. Solo dibuja: qué usuarios, ya filtrados, y
 * los datos para completar cada fila los resuelve la página.
 */
export default function TablaDeUsuarios({
  usuarios,
  totalDeApps,
  idsDelCatalogo,
  empresaPorId,
  empresasPorUsuario,
  empresaPorOmision,
  usuarioActualId,
  eliminar,
}: {
  usuarios: UsuarioConAcceso[];
  /** Cuántas aplicaciones hay en el catálogo: el «de» de «3 de 14». */
  totalDeApps: number;
  idsDelCatalogo: ReadonlySet<string>;
  empresaPorId: ReadonlyMap<string, Empresa>;
  /** usuario_id → ids de empresa asignados. */
  empresasPorUsuario: ReadonlyMap<string, string[]>;
  empresaPorOmision: Empresa | undefined;
  /** Quien está mirando: no se puede eliminar a sí mismo. */
  usuarioActualId: string;
  eliminar: (form: FormData) => void;
}) {
  return (
    <>
    {/* Celular: una tarjeta por persona; tocarla abre su ficha para editarla. */}
    <ul className="space-y-2 lg:hidden">
      {usuarios.map((usuario) => {
        const esAdmin = usuario.rol === "admin";
        const asignadas = appsAsignadasVigentes(usuario, idsDelCatalogo);
        const nombreMostrado = usuario.nombre || usuario.correo;
        return (
          <li key={usuario.id}>
            <Link
              href={`/usuarios/${usuario.id}`}
              className={`${TARJETA} flex items-center gap-3 p-3.5 transition hover:border-naranjo/40 ${usuario.activo ? "" : "opacity-70"}`}
            >
              <Avatar nombre={usuario.nombre} correo={usuario.correo} admin={esAdmin} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-tinta">
                  {nombreMostrado}
                  {usuario.id === usuarioActualId && <span className="ml-1.5 rounded-full bg-tinta/10 px-1.5 py-0.5 text-[10px] font-semibold text-tinta/70">Tú</span>}
                  {usuario.tipo === "invitado" && <span className="ml-1.5 rounded-full bg-violet-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Invitado</span>}
                </span>
                {usuario.nombre && <span className="block truncate text-xs text-tinta/60">{usuario.correo}</span>}
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${esAdmin ? "bg-naranjo/10 text-naranjo" : "bg-teal/10 text-teal"}`}>{esAdmin ? "Administrador" : "Usuario"}</span>
                  {!esAdmin && <span className="text-tinta/60">{asignadas} de {totalDeApps} apps</span>}
                  {!usuario.activo && <span className="font-semibold text-tinta/60">· Inactivo</span>}
                </span>
              </span>
              <IconPencil size={16} className="shrink-0 text-tinta/40" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
    <div className={`${TARJETA} hidden overflow-x-auto lg:block`}>
      <table className="w-full min-w-[900px] table-fixed text-left text-sm">
        <caption className="sr-only">Usuarios del Core</caption>
        <colgroup>
          <col className="w-[28%]" />
          <col className="w-[12%]" />
          <col className="w-[15%]" />
          <col className="w-[14%]" />
          <col className="w-[10%]" />
          <col className="w-[21%]" />
        </colgroup>
        <thead className="border-b border-borde bg-crema/60">
          <tr>
            <th scope="col" className={CABECERA}>Persona</th>
            <th scope="col" className={CABECERA}>Rol</th>
            <th scope="col" className={CABECERA}>Aplicaciones</th>
            <th scope="col" className={CABECERA}>Empresas</th>
            <th scope="col" className={CABECERA}>Último ingreso</th>
            <th scope="col" className={`${CABECERA} text-right`}>Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {usuarios.map((usuario) => {
            const esAdmin = usuario.rol === "admin";
            const asignadas = appsAsignadasVigentes(usuario, idsDelCatalogo);
            const empresas = (empresasPorUsuario.get(usuario.id) ?? [])
              .map((id) => empresaPorId.get(id))
              .filter((e): e is Empresa => e !== undefined);
            const nombreMostrado = usuario.nombre || usuario.correo;
            return (
              <tr key={usuario.id} className={`transition hover:bg-tinta/[0.02] ${usuario.activo ? "" : "bg-tinta/[0.025]"}`}>
                <td className={CELDA}>
                  <div className="flex items-center gap-3">
                    <Avatar nombre={usuario.nombre} correo={usuario.correo} admin={esAdmin} />
                    <div className="min-w-0">
                      <p className={`truncate font-semibold ${usuario.activo ? "text-tinta" : "text-tinta/60"}`}>
                        {nombreMostrado}
                        {usuario.id === usuarioActualId && (
                          <span className="ml-2 rounded-full bg-tinta/10 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-tinta/70">Tú</span>
                        )}
                        {usuario.tipo === "invitado" && (
                          <span className="ml-2 rounded-full bg-violet-500/12 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-violet-700">Invitado</span>
                        )}
                        {!usuario.activo && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-borde px-1.5 py-0.5 align-middle text-[10px] font-semibold text-tinta/65">
                            <IconUserOff size={10} stroke={2.2} aria-hidden /> Inactivo
                          </span>
                        )}
                      </p>
                      {usuario.nombre && <p className="truncate text-xs text-tinta/60">{usuario.correo}</p>}
                    </div>
                  </div>
                </td>

                <td className={CELDA}>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      esAdmin ? "bg-naranjo/10 text-naranjo" : "bg-teal/10 text-teal"
                    }`}
                  >
                    {esAdmin && <IconShieldCheck size={12} stroke={2.2} aria-hidden />}
                    {esAdmin ? "Administrador" : "Usuario"}
                  </span>
                </td>

                <td className={CELDA}>
                  {esAdmin ? (
                    <span className="text-xs text-tinta/70">Todas, por ser administrador</span>
                  ) : asignadas === 0 ? (
                    <span className="tono-aviso inline-flex items-center gap-1 text-xs font-semibold">
                      <IconClock size={13} stroke={2.2} aria-hidden /> Sin aplicaciones
                    </span>
                  ) : (
                    <div>
                      <p className="text-xs text-tinta/70">
                        <span className="font-semibold text-tinta">{asignadas}</span> de {totalDeApps}
                      </p>
                      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-tinta/10" aria-hidden>
                        <div
                          className="h-full rounded-full bg-naranjo"
                          style={{ width: `${Math.min(100, (asignadas / Math.max(1, totalDeApps)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </td>

                <td className={CELDA}>
                  {esAdmin ? (
                    <span className="text-xs text-tinta/70">Todas</span>
                  ) : empresas.length > 0 ? (
                    <ul className="flex flex-wrap gap-1">
                      {empresas.map((e) => (
                        <li
                          key={e.id}
                          className="inline-flex items-center gap-1 rounded-full border border-borde px-2 py-0.5 text-[11px] font-medium text-tinta/80"
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: e.color }} aria-hidden />
                          {e.nombre}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs text-tinta/60" title="Sin ninguna asignada, ve la empresa principal">
                      {empresaPorOmision?.nombre ?? "—"} <span className="text-tinta/45">(por omisión)</span>
                    </span>
                  )}
                </td>

                <td className={`${CELDA} text-xs text-tinta/70`}>
                  {usuario.ultimo_ingreso ? haceCuanto(usuario.ultimo_ingreso) : <span className="text-tinta/50">Nunca</span>}
                </td>

                <td className={CELDA}>
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/usuarios/${usuario.id}`}
                      aria-label={`Editar a ${nombreMostrado}`}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-borde px-3 text-xs font-semibold text-tinta/75 transition hover:border-naranjo/40 hover:bg-naranjo/10 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                    >
                      <IconPencil size={14} stroke={2} aria-hidden /> Editar
                    </Link>
                    {usuario.id !== usuarioActualId && (
                      <BotonEliminar
                        accion={eliminar}
                        id={usuario.id}
                        nombre={nombreMostrado}
                        mensajeConfirmacion={`¿Eliminar a "${usuario.correo}"? Perderá el acceso de inmediato.`}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
