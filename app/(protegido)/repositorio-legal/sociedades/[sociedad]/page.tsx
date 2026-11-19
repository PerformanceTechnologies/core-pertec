import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconChecklist, IconFiles } from "@tabler/icons-react";
import { Kpi, Seccion } from "@/components/fin/piezas";
import ErrorSharePoint from "@/components/repositorio-legal/ErrorSharePoint";
import { HOJA, IconoEnTile } from "@/components/repositorio-legal/Resumen";
import TablaDocumentos from "@/components/repositorio-legal/TablaDocumentos";
import { claseClave, ETIQUETA_CLAVE } from "@/components/repositorio-legal/Visual";
import { IconBuildingBank } from "@tabler/icons-react";
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
  const ok = clave.filter((c) => c.estado === "ok").length;
  const filtro = (estado: string) => `${RUTA_REPOSITORIO_LEGAL}/documentos?estado=${estado}&sociedad=${s.slug}`;

  return (
    <div className="space-y-7">
      <section className={`${HOJA} p-5`}>
        <Link href={RUTA_REPOSITORIO_LEGAL} className="inline-flex items-center gap-1 text-xs font-semibold text-gris hover:text-naranjo">
          <IconArrowLeft size={13} /> Resumen
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <IconoEnTile Icono={IconBuildingBank} tono={r.vencidos ? "alerta" : r.porVencer ? "aviso" : r.faltantes ? "naranjo" : "cian"} />
          <div className="min-w-0 flex-1">
            <h2 className="font-condensed text-3xl font-bold uppercase leading-tight tracking-tight text-tinta">{s.nombre}</h2>
            <p className="text-xs text-gris">SharePoint: SOCIEDADES / {s.carpeta}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi etiqueta="Documentos clave" valor={`${ok}/${clave.length}`} detalle="al día" tono={ok === clave.length ? "text-ok" : "text-tinta"} />
        <Kpi etiqueta="Vencidos" valor={String(r.vencidos)} tono={r.vencidos ? "text-alerta" : "text-tinta"} href={filtro("vencido")} detalle="ver cuáles" />
        <Kpi etiqueta="Por vencer" valor={String(r.porVencer)} tono={r.porVencer ? "text-aviso" : "text-tinta"} href={filtro("por_vencer")} detalle="en 30 días" />
        <Kpi etiqueta="Sin fecha de emisión" valor={String(r.sinFecha)} tono={r.sinFecha ? "text-naranjo" : "text-tinta"} href={filtro("sin_fecha")} detalle="por completar" />
        <Kpi etiqueta="Última emisión" valor={r.ultimaEmision ? formatearFecha(r.ultimaEmision) : "—"} detalle={r.ultimaEmision ? antiguedad(r.ultimaEmision) : undefined} />
      </div>

      <Seccion titulo="Documentos clave" icono={<IconChecklist size={15} />}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {clave.map((c) => (
            <div key={c.tipo.id} className={`rounded-2xl border px-4 py-3 ${claseClave(c.estado)}`}>
              <div className="flex items-center gap-2">
                <p className="flex-1 text-sm font-semibold">{c.tipo.nombre}</p>
                <span className="text-[11px] font-bold uppercase tracking-wide">{ETIQUETA_CLAVE[c.estado]}</span>
              </div>
              <p className="mt-0.5 text-xs opacity-80">
                {c.documento ? `Emitido ${formatearFecha(c.documento.emision)}${c.documento.vence ? ` · vence ${formatearFecha(c.documento.vence)}` : ""}` : "No hay un documento de este tipo"}
              </p>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo={`Documentos · ${r.documentos}`} icono={<IconFiles size={15} />}>
        <TablaDocumentos documentos={repo.documentos.filter((d) => d.sociedad === s.slug && d.area !== "revisar")} sociedades={repo.sociedades} carpetas={repo.carpetas} permisos={{ subir: permisos.subir, editar: permisos.editar }} sociedadFija={s.slug} />
      </Seccion>
    </div>
  );
}
