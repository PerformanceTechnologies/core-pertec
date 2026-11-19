import Link from "next/link";
import { notFound } from "next/navigation";
import ErrorSharePoint from "@/components/repositorio-legal/ErrorSharePoint";
import TablaDocumentos from "@/components/repositorio-legal/TablaDocumentos";
import { Cifra, claseClave, ETIQUETA_CLAVE } from "@/components/repositorio-legal/Visual";
import { TARJETA } from "@/lib/estilos";
import { datosDePagina } from "@/lib/repositorio-legal/pagina";
import { antiguedad, documentosClave, formatearFecha, resumirSociedad, RUTA_REPOSITORIO_LEGAL } from "@/lib/repositorio-legal/modelo";

export default async function FichaDeSociedad({ params }: { params: Promise<{ sociedad: string }> }) {
  const { sociedad: slug } = await params;
  const { permisos, repo, error } = await datosDePagina();
  if (!repo) return <ErrorSharePoint mensaje={error ?? ""} volver={`${RUTA_REPOSITORIO_LEGAL}/sociedades/${slug}`} />;
  const s = repo.sociedades.find((x) => x.slug === slug);
  if (!s) notFound();

  const r = resumirSociedad(repo.documentos, s.slug);
  const clave = documentosClave(repo.documentos, s.slug);

  return (
    <div className="space-y-5">
      <div className={`${TARJETA} p-5`}>
        <Link href={RUTA_REPOSITORIO_LEGAL} className="text-xs font-semibold text-gris hover:text-naranjo">
          ← Sociedades
        </Link>
        <h2 className="mt-1 font-condensed text-3xl font-bold uppercase tracking-tight text-tinta">{s.nombre}</h2>
        <p className="text-sm text-gris">Carpeta en SharePoint: SOCIEDADES/{s.carpeta}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Cifra valor={r.documentos} etiqueta="Documentos" />
          <Cifra valor={r.vencidos} etiqueta="Vencidos" tono="alerta" />
          <Cifra valor={r.porVencer} etiqueta="Por vencer" tono="aviso" />
          <Cifra valor={r.sinFecha} etiqueta="Sin fecha de emisión" tono="naranjo" />
          <Cifra valor={r.ultimaEmision ? formatearFecha(r.ultimaEmision) : "—"} etiqueta={r.ultimaEmision ? `Última emisión · ${antiguedad(r.ultimaEmision)}` : "Última emisión"} />
        </div>
      </div>

      <section>
        <h3 className="etiqueta-seccion mb-2">Documentos clave</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {clave.map((c) => (
            <div key={c.tipo.id} className={`rounded-xl border px-3 py-2 ${claseClave(c.estado)}`}>
              <p className="text-sm font-semibold">{c.tipo.nombre}</p>
              <p className="text-xs opacity-80">
                {ETIQUETA_CLAVE[c.estado]}
                {c.documento?.emision ? ` · emitido ${formatearFecha(c.documento.emision)}` : ""}
                {c.documento?.vence ? ` · vence ${formatearFecha(c.documento.vence)}` : ""}
              </p>
            </div>
          ))}
        </div>
      </section>

      <TablaDocumentos documentos={repo.documentos.filter((d) => d.sociedad === s.slug)} sociedades={repo.sociedades} carpetas={repo.carpetas} permisos={{ subir: permisos.subir, editar: permisos.editar }} sociedadFija={s.slug} />
    </div>
  );
}
