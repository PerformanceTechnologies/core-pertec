import Link from "next/link";
import { IconAlertTriangle, IconChevronRight } from "@tabler/icons-react";
import ErrorSharePoint from "@/components/repositorio-legal/ErrorSharePoint";
import { ChipEstado, Cifra, claseClave, ETIQUETA_CLAVE } from "@/components/repositorio-legal/Visual";
import { TARJETA } from "@/lib/estilos";
import { datosDePagina } from "@/lib/repositorio-legal/pagina";
import { antiguedad, documentosClave, formatearFecha, requierenAtencion, resumirSociedad, RUTA_REPOSITORIO_LEGAL } from "@/lib/repositorio-legal/modelo";

export default async function InicioRepositorioLegal() {
  const { repo, error } = await datosDePagina();
  if (!repo) return <ErrorSharePoint mensaje={error ?? ""} volver={RUTA_REPOSITORIO_LEGAL} />;

  const docs = repo.documentos;
  const atencion = requierenAtencion(docs);
  const sinCopias = docs.filter((d) => !d.copiaDe);
  const malla = docs.find((d) => d.tipo === "malla" && /^(png|jpe?g|webp)$/.test(d.extension));
  const nombre = new Map(repo.sociedades.map((s) => [s.slug, s.nombre]));

  // Las sociedades con más problemas, primero.
  const tarjetas = repo.sociedades
    .map((s) => ({ s, r: resumirSociedad(docs, s.slug), clave: documentosClave(docs, s.slug) }))
    .sort((a, b) => b.r.vencidos * 3 + b.r.faltantes * 2 + b.r.porVencer - (a.r.vencidos * 3 + a.r.faltantes * 2 + a.r.porVencer) || a.s.nombre.localeCompare(b.s.nombre, "es"));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Cifra valor={repo.sociedades.length} etiqueta="Sociedades" />
        <Cifra valor={sinCopias.length} etiqueta="Documentos (sin copias)" />
        <Cifra valor={sinCopias.filter((d) => d.estado === "vencido").length} etiqueta="Vencidos" tono="alerta" />
        <Cifra valor={sinCopias.filter((d) => d.estado === "por_vencer").length} etiqueta="Por vencer (30 días)" tono="aviso" />
        <Cifra valor={sinCopias.filter((d) => d.estado === "sin_fecha").length} etiqueta="Sin fecha de emisión" tono="naranjo" />
      </div>

      {atencion.length > 0 && (
        <section className={`${TARJETA} border-alerta/30 p-4`}>
          <div className="mb-3 flex items-center gap-2">
            <IconAlertTriangle size={18} className="text-alerta" />
            <h2 className="font-condensed text-lg font-bold uppercase text-tinta">Requiere atención</h2>
            <Link href={`${RUTA_REPOSITORIO_LEGAL}/vencimientos`} className="ml-auto text-sm font-semibold text-naranjo hover:underline">
              Ver todo →
            </Link>
          </div>
          <ul className="divide-y divide-borde/70">
            {atencion.slice(0, 8).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <ChipEstado estado={d.estado} />
                <Link href={`${RUTA_REPOSITORIO_LEGAL}/sociedades/${d.sociedad}`} className="font-semibold text-tinta hover:text-naranjo">
                  {d.tipoNombre}
                </Link>
                <span className="text-gris">{d.sociedad ? nombre.get(d.sociedad) : ""}</span>
                <span className="ml-auto text-xs text-gris">
                  Emitido {formatearFecha(d.emision)} · {d.estado === "vencido" ? "venció" : "vence"} {formatearFecha(d.vence)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="etiqueta-seccion mb-3">Sociedades del grupo</h2>
        <div className="escalonar grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tarjetas.map(({ s, r, clave }) => (
            <Link key={s.slug} href={`${RUTA_REPOSITORIO_LEGAL}/sociedades/${s.slug}`} className={`${TARJETA} group block p-4 transition hover:border-naranjo/40`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-condensed text-lg font-bold uppercase leading-tight text-tinta">{s.nombre}</p>
                  <p className="text-xs text-gris">
                    {r.documentos} documentos · última emisión {r.ultimaEmision ? `${formatearFecha(r.ultimaEmision)} (${antiguedad(r.ultimaEmision)})` : "—"}
                  </p>
                </div>
                <IconChevronRight size={18} className="text-gris-suave transition group-hover:text-naranjo" />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.vencidos > 0 && <span className="rounded-full bg-alerta/12 px-2 py-0.5 text-[11px] font-semibold text-alerta">{r.vencidos} vencidos</span>}
                {r.porVencer > 0 && <span className="rounded-full bg-aviso/15 px-2 py-0.5 text-[11px] font-semibold text-aviso">{r.porVencer} por vencer</span>}
                {r.faltantes > 0 && <span className="rounded-full bg-tinta/[0.06] px-2 py-0.5 text-[11px] font-semibold text-gris">{r.faltantes} faltan</span>}
                {r.vencidos + r.porVencer + r.faltantes === 0 && <span className="rounded-full bg-ok/12 px-2 py-0.5 text-[11px] font-semibold text-ok">Al día</span>}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1">
                {clave.map((c) => (
                  <span key={c.tipo.id} title={`${c.tipo.nombre}: ${ETIQUETA_CLAVE[c.estado]}`} className={`truncate rounded-md border px-1.5 py-1 text-[10px] font-semibold ${claseClave(c.estado)}`}>
                    {c.tipo.nombre.replace(/ \/.*$/, "").replace("Publicación en ", "")}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {malla && (
        <section className={`${TARJETA} p-4`}>
          <h2 className="etiqueta-seccion mb-3">Malla societaria</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/repositorio-legal/archivo/${malla.id}`} alt="Malla societaria del grupo" className="mx-auto max-h-[420px] w-auto rounded-lg" />
          <p className="mt-2 text-center text-xs text-gris">Desde SharePoint: {malla.ruta}</p>
        </section>
      )}
    </div>
  );
}
