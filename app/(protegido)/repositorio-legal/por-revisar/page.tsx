import { IconFolderQuestion } from "@tabler/icons-react";
import { Seccion, Vacio } from "@/components/fin/piezas";
import ErrorSharePoint from "@/components/repositorio-legal/ErrorSharePoint";
import TablaDocumentos from "@/components/repositorio-legal/TablaDocumentos";
import { datosDePagina } from "@/lib/repositorio-legal/pagina";
import { RUTA_REPOSITORIO_LEGAL } from "@/lib/repositorio-legal/modelo";

/**
 * «POR REVISAR» en SharePoint: lo que no es documentación legal de una sociedad (cotizaciones, formularios
 * por completar, comprobantes, fotos…) o que no se sabe de quién es. No cuenta en cifras ni alertas. Desde acá
 * se mueve a su sociedad o se elimina.
 */
export default async function PorRevisarPage() {
  const { permisos, repo, error } = await datosDePagina();
  if (!repo) return <ErrorSharePoint mensaje={error ?? ""} volver={`${RUTA_REPOSITORIO_LEGAL}/por-revisar`} />;
  const docs = repo.documentos.filter((d) => d.area === "revisar");
  return (
    <Seccion titulo={`Por revisar · ${docs.length}`} icono={<IconFolderQuestion size={15} />}>
      <p className="mb-4 text-sm text-gris">No es documentación legal de una sociedad o no se sabe de quién es. No cuenta en las cifras ni en las alertas. Muévelo a su sociedad (botón «Mover») o elimínalo.</p>
      {docs.length === 0 ? (
        <Vacio titulo="No hay nada por revisar" texto="Todo lo que está en el repositorio es documentación legal con su sociedad." />
      ) : (
        <TablaDocumentos documentos={docs} sociedades={repo.sociedades} carpetas={repo.carpetas} permisos={{ subir: false, editar: permisos.editar }} />
      )}
    </Seccion>
  );
}
