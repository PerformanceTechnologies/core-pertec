import { exigirAdmin } from "@/lib/autorizacion";
import { listarUsuarios } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import { empresaIdsPorUsuario, listarEmpresas } from "@/lib/empresas";
import { SLUG_POR_OMISION } from "@/lib/empresas-modelo";
import {
  appsAsignadasVigentes,
  filtrarUsuarios,
  hayFiltrosDeUsuarios,
  hrefConFiltros,
  leerFiltrosDeUsuarios,
  parametrosDeUsuarios,
} from "@/lib/administracion-modelo";
import FormularioUsuario from "@/components/FormularioUsuario";
import EncabezadoAdmin from "@/components/admin/EncabezadoAdmin";
import PanelDeCreacion from "@/components/admin/PanelDeCreacion";
import TablaDeUsuarios from "@/components/admin/TablaDeUsuarios";
import { Buscador, CifrasQueFiltran, ResultadoDeFiltros, SinResultados } from "@/components/admin/Filtros";
import { crearUsuarioAction, eliminarUsuarioAction } from "./acciones";

export const dynamic = "force-dynamic";

/**
 * Administración > Usuarios: quién entra al Core, con qué rol, a qué aplicaciones y en qué
 * empresas. Los filtros viajan en la dirección (?estado=…&rol=…&q=…): se pueden compartir y el
 * botón «atrás» los respeta.
 */
export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await exigirAdmin();
  const filtros = leerFiltrosDeUsuarios(await searchParams);
  const [usuarios, apps, empresas, empresasPorUsuario] = await Promise.all([
    listarUsuarios(),
    listarAplicaciones(),
    listarEmpresas(),
    empresaIdsPorUsuario(),
  ]);

  const idsDelCatalogo = new Set(apps.map((a) => a.id));
  const visibles = filtrarUsuarios(usuarios, filtros, idsDelCatalogo);
  const activos = usuarios.filter((u) => u.activo);
  const sinApps = activos.filter((u) => u.rol !== "admin" && appsAsignadasVigentes(u, idsDelCatalogo) === 0).length;

  // Tocar una cifra pone ESE filtro y quita los demás (menos la búsqueda): se lee como un solo selector.
  const soloBusqueda: Record<string, string> = filtros.q ? { q: filtros.q } : {};
  const hrefDe = (extra: Record<string, string>) => hrefConFiltros("/usuarios", soloBusqueda, extra);
  const sinOtros = !filtros.sinApps && filtros.estado === "todos" && filtros.rol === "todos";

  return (
    <div className="animar-entrada space-y-6">
      <EncabezadoAdmin
        titulo="Usuarios"
        descripcion="Quién entra al Core, con qué rol, a qué aplicaciones y en qué empresas puede trabajar."
      />

      <PanelDeCreacion titulo="Nuevo usuario" ayuda="Dale acceso a una persona de @pertec.cl: su rol, sus aplicaciones y sus empresas.">
        <FormularioUsuario
          accion={crearUsuarioAction}
          todasLasApps={apps}
          todasLasEmpresas={empresas}
          textoBoton="Crear usuario"
        />
      </PanelDeCreacion>

      <CifrasQueFiltran
        etiqueta="Filtrar usuarios"
        cifras={[
          { clave: "todos", etiqueta: "Todos", valor: usuarios.length, href: hrefDe({}), activa: sinOtros },
          { clave: "activos", etiqueta: "Activos", valor: activos.length, href: hrefDe({ estado: "activos" }), activa: filtros.estado === "activos" && !filtros.sinApps && filtros.rol === "todos" },
          { clave: "inactivos", etiqueta: "Inactivos", valor: usuarios.length - activos.length, href: hrefDe({ estado: "inactivos" }), activa: filtros.estado === "inactivos" },
          { clave: "admin", etiqueta: "Administradores", valor: usuarios.filter((u) => u.rol === "admin").length, href: hrefDe({ rol: "admin" }), activa: filtros.rol === "admin" },
          { clave: "sin-apps", etiqueta: "Sin aplicaciones", valor: sinApps, href: hrefDe({ acceso: "sin-apps" }), activa: filtros.sinApps, tono: "aviso" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Buscador
          accion="/usuarios"
          placeholder="Buscar por nombre o correo"
          valor={filtros.q}
          conservar={parametrosDeUsuarios({ ...filtros, q: "" })}
        />
        <ResultadoDeFiltros
          mostrados={visibles.length}
          total={usuarios.length}
          unidad="usuarios"
          limpiarHref={hayFiltrosDeUsuarios(filtros) ? "/usuarios" : null}
        />
      </div>

      {usuarios.length === 0 ? (
        <SinResultados texto="Todavía no hay usuarios registrados." limpiarHref={null} />
      ) : visibles.length === 0 ? (
        <SinResultados texto="Ningún usuario calza con los filtros." limpiarHref="/usuarios" />
      ) : (
        <TablaDeUsuarios
          usuarios={visibles}
          totalDeApps={apps.length}
          idsDelCatalogo={idsDelCatalogo}
          empresaPorId={new Map(empresas.map((e) => [e.id, e]))}
          empresasPorUsuario={empresasPorUsuario}
          empresaPorOmision={empresas.find((e) => e.slug === SLUG_POR_OMISION)}
          usuarioActualId={admin.id}
          eliminar={eliminarUsuarioAction}
        />
      )}
    </div>
  );
}
