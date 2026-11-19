import Link from "next/link";
import ErrorSharePoint from "@/components/repositorio-legal/ErrorSharePoint";
import { pesoLegible } from "@/components/repositorio-legal/Visual";
import { TARJETA } from "@/lib/estilos";
import { datosDePagina } from "@/lib/repositorio-legal/pagina";
import { formatearFecha, RUTA_REPOSITORIO_LEGAL } from "@/lib/repositorio-legal/modelo";

/**
 * Los paquetes de antecedentes que se enviaron a terceros (bancos, mutual, abogados…), tal como están en
 * SharePoint. Para armar uno nuevo se eligen documentos en «Documentos» y se descarga el ZIP: así no se
 * vuelven a copiar los PDFs a otra carpeta.
 */
export default async function SolicitudesLegales() {
  const { repo, error } = await datosDePagina();
  if (!repo) return <ErrorSharePoint mensaje={error ?? ""} volver={`${RUTA_REPOSITORIO_LEGAL}/solicitudes`} />;
  return (
    <div className="space-y-4">
      <div className={`${TARJETA} p-4 text-sm text-gris`}>
        ¿Te pidieron antecedentes? Ve a{" "}
        <Link href={`${RUTA_REPOSITORIO_LEGAL}/documentos`} className="font-semibold text-naranjo hover:underline">
          Documentos
        </Link>
        , marca los que necesitas (de una o varias sociedades) y descarga el paquete en ZIP, ordenado por sociedad.
      </div>
      {repo.paquetes.length === 0 && <p className="text-sm text-gris">No hay paquetes históricos.</p>}
      {repo.paquetes.map((p) => {
        const docs = repo.documentos.filter((d) => d.ruta.startsWith(`${p.carpeta}/`));
        return (
          <details key={p.carpeta} className={`${TARJETA} group p-4`}>
            <summary className="flex cursor-pointer list-none items-center gap-3">
              <span className="font-condensed text-lg font-bold uppercase text-tinta">{p.nombre}</span>
              <span className="text-xs text-gris">
                {p.carpeta.split("/")[0]} · {p.documentos} archivos{p.ultimo ? ` · actualizado ${formatearFecha(p.ultimo.slice(0, 10))}` : ""}
              </span>
              <span className="ml-auto text-xs font-semibold text-naranjo group-open:hidden">Ver</span>
            </summary>
            <ul className="mt-3 divide-y divide-borde/60 text-sm">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <a href={`/api/repositorio-legal/archivo/${d.id}`} className="text-tinta hover:text-naranjo">
                    {d.ruta.slice(p.carpeta.length + 1)}
                  </a>
                  <span className="ml-auto text-xs text-gris">
                    {d.tipoNombre} · emitido {formatearFecha(d.emision)} · {pesoLegible(d.tamano)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
