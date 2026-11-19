import { IconFiles } from "@tabler/icons-react";
import { Seccion } from "@/components/fin/piezas";
import ErrorSharePoint from "@/components/repositorio-legal/ErrorSharePoint";
import TablaDocumentos from "@/components/repositorio-legal/TablaDocumentos";
import { datosDePagina } from "@/lib/repositorio-legal/pagina";
import { CATEGORIAS, ETIQUETA_ESTADO, RUTA_REPOSITORIO_LEGAL, type Categoria, type Estado } from "@/lib/repositorio-legal/modelo";

/** El buscador global. Acepta ?estado=, ?sociedad= y ?categoria= (los usan las tarjetas del Resumen). */
export default async function DocumentosLegales({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const uno = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : null);
  const { permisos, repo, error } = await datosDePagina();
  if (!repo) return <ErrorSharePoint mensaje={error ?? ""} volver={`${RUTA_REPOSITORIO_LEGAL}/documentos`} />;

  const estado = uno("estado");
  const estadoInicial = estado === "atencion" || (estado && estado in ETIQUETA_ESTADO) ? (estado as Estado | "atencion") : "todos";
  const sociedad = uno("sociedad");
  const sociedadInicial = sociedad && repo.sociedades.some((s) => s.slug === sociedad) ? sociedad : null;
  const categoria = uno("categoria");
  const categoriaInicial = CATEGORIAS.some((c) => c.id === categoria) ? (categoria as Categoria) : null;

  return (
    <Seccion titulo="Todos los documentos" icono={<IconFiles size={15} />}>
      <TablaDocumentos
        // La key reinicia los filtros cuando se llega con otros por la URL.
        key={`${estadoInicial}|${sociedadInicial}|${categoriaInicial}`}
        documentos={repo.documentos}
        sociedades={repo.sociedades}
        carpetas={repo.carpetas}
        permisos={{ subir: permisos.subir, editar: permisos.editar }}
        estadoInicial={estadoInicial}
        sociedadInicial={sociedadInicial}
        categoriaInicial={categoriaInicial}
      />
    </Seccion>
  );
}
