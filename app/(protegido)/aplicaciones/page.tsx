import { exigirAdmin } from "@/lib/autorizacion";
import { contarUsuariosPorApp, listarAplicaciones } from "@/lib/aplicaciones";
import { agruparCatalogo } from "@/lib/menu-modelo";
import {
  contarAppsPorEstado,
  filtrarApps,
  hayFiltrosDeApps,
  hrefConFiltros,
  leerFiltrosDeApps,
  parametrosDeApps,
  type FiltroEstadoApp,
} from "@/lib/administracion-modelo";
import FormularioAplicacion from "@/components/FormularioAplicacion";
import CatalogoDeAplicaciones from "@/components/admin/CatalogoDeAplicaciones";
import EncabezadoAdmin from "@/components/admin/EncabezadoAdmin";
import PanelDeCreacion from "@/components/admin/PanelDeCreacion";
import { Buscador, CifrasQueFiltran, ResultadoDeFiltros, SinResultados } from "@/components/admin/Filtros";
import { crearAplicacionAction, eliminarAplicacionAction, moverAplicacionAction } from "./acciones";

export const dynamic = "force-dynamic";

/**
 * Administración > Aplicaciones: el catálogo del Core agrupado como se ve el menú, con filtros por
 * estado y búsqueda. Los filtros viajan en la dirección (?estado=…&q=…): se pueden compartir y el
 * botón «atrás» los respeta.
 */
export default async function AplicacionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirAdmin();
  const filtros = leerFiltrosDeApps(await searchParams);
  const [apps, usuariosPorApp] = await Promise.all([listarAplicaciones(), contarUsuariosPorApp()]);

  const conteo = contarAppsPorEstado(apps);
  const visibles = filtrarApps(apps, filtros);
  const grupos = agruparCatalogo(visibles);

  // Tocar una cifra cambia el estado y deja la búsqueda como estaba.
  const sinEstado = parametrosDeApps({ ...filtros, estado: "todas" });
  const hrefEstado = (estado: FiltroEstadoApp) =>
    hrefConFiltros("/aplicaciones", sinEstado, { estado: estado === "todas" ? undefined : estado });

  return (
    <div className="animar-entrada space-y-6">
      <EncabezadoAdmin
        titulo="Aplicaciones"
        descripcion="El catálogo del Core: qué aplicaciones existen, a qué módulo pertenecen, dónde viven y en qué estado están."
      />

      <PanelDeCreacion titulo="Nueva aplicación" ayuda="Súmala al catálogo; después asígnala a las personas desde Usuarios.">
        <FormularioAplicacion accion={crearAplicacionAction} textoBoton="Crear aplicación" />
      </PanelDeCreacion>

      <CifrasQueFiltran
        etiqueta="Filtrar por estado"
        cifras={[
          { clave: "todas", etiqueta: "Todas", valor: conteo.total, href: hrefEstado("todas"), activa: filtros.estado === "todas" },
          { clave: "activa", etiqueta: "Activas", valor: conteo.activa, href: hrefEstado("activa"), activa: filtros.estado === "activa" },
          { clave: "en_desarrollo", etiqueta: "En desarrollo", valor: conteo.en_desarrollo, href: hrefEstado("en_desarrollo"), activa: filtros.estado === "en_desarrollo" },
          { clave: "mantenimiento", etiqueta: "En mantención", valor: conteo.mantenimiento, href: hrefEstado("mantenimiento"), activa: filtros.estado === "mantenimiento", tono: "aviso" },
          { clave: "en-pausa", etiqueta: "En pausa", valor: conteo["en-pausa"], href: hrefEstado("en-pausa"), activa: filtros.estado === "en-pausa" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Buscador
          accion="/aplicaciones"
          placeholder="Buscar por nombre, descripción o ruta"
          valor={filtros.q}
          conservar={filtros.estado === "todas" ? {} : { estado: filtros.estado }}
        />
        <ResultadoDeFiltros
          mostrados={visibles.length}
          total={apps.length}
          unidad="aplicaciones"
          limpiarHref={hayFiltrosDeApps(filtros) ? "/aplicaciones" : null}
        />
      </div>

      {apps.length === 0 ? (
        <SinResultados texto="Todavía no hay aplicaciones registradas." limpiarHref={null} />
      ) : grupos.length === 0 ? (
        <SinResultados texto="Ninguna aplicación calza con los filtros." limpiarHref="/aplicaciones" />
      ) : (
        <CatalogoDeAplicaciones
          grupos={grupos}
          usuariosPorApp={usuariosPorApp}
          eliminar={eliminarAplicacionAction}
          mover={moverAplicacionAction}
        />
      )}
    </div>
  );
}
