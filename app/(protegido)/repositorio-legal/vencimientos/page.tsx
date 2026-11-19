import { IconAlertTriangle } from "@tabler/icons-react";
import { Seccion } from "@/components/fin/piezas";
import ErrorSharePoint from "@/components/repositorio-legal/ErrorSharePoint";
import TablaDocumentos from "@/components/repositorio-legal/TablaDocumentos";
import { datosDePagina } from "@/lib/repositorio-legal/pagina";
import { DIAS_AVISO_LEGAL, RUTA_REPOSITORIO_LEGAL } from "@/lib/repositorio-legal/modelo";

/** Todo lo vencido o por vencer del grupo, lo más urgente arriba, con «Renovar» en cada fila. */
export default async function VencimientosLegales() {
  const { permisos, repo, error } = await datosDePagina();
  if (!repo) return <ErrorSharePoint mensaje={error ?? ""} volver={`${RUTA_REPOSITORIO_LEGAL}/vencimientos`} />;
  return (
    <Seccion titulo="Vencidos y por vencer" icono={<IconAlertTriangle size={15} />}>
      <p className="mb-4 text-sm text-gris">
        La vigencia se calcula desde la <span className="font-semibold text-tinta">fecha de emisión</span> según el tipo de documento (por ejemplo, un certificado de vigencia vale 60 días). «Por vencer» es a {DIAS_AVISO_LEGAL} días o menos. Solo cuenta el documento más reciente de cada tipo: los anteriores quedan como «Reemplazado».
      </p>
      <TablaDocumentos documentos={repo.documentos} sociedades={repo.sociedades} carpetas={repo.carpetas} permisos={{ subir: permisos.subir, editar: permisos.editar }} estadoInicial="atencion" />
    </Seccion>
  );
}
