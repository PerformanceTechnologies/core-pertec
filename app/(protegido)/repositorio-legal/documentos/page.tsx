import ErrorSharePoint from "@/components/repositorio-legal/ErrorSharePoint";
import TablaDocumentos from "@/components/repositorio-legal/TablaDocumentos";
import { datosDePagina } from "@/lib/repositorio-legal/pagina";
import { RUTA_REPOSITORIO_LEGAL } from "@/lib/repositorio-legal/modelo";

/** El buscador global: todos los documentos de todas las sociedades, con sus filtros. */
export default async function DocumentosLegales() {
  const { permisos, repo, error } = await datosDePagina();
  if (!repo) return <ErrorSharePoint mensaje={error ?? ""} volver={`${RUTA_REPOSITORIO_LEGAL}/documentos`} />;
  return <TablaDocumentos documentos={repo.documentos} sociedades={repo.sociedades} carpetas={repo.carpetas} permisos={{ subir: permisos.subir, editar: permisos.editar }} />;
}
