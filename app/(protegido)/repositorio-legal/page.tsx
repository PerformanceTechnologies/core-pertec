import Link from "next/link";
import { IconAlertTriangle, IconBuildingBank, IconCalendarClock, IconCalendarQuestion, IconChevronRight } from "@tabler/icons-react";
import { Seccion } from "@/components/fin/piezas";
import ErrorSharePoint from "@/components/repositorio-legal/ErrorSharePoint";
import { HOJA, IconoEnTile, ParaHoy, SaludDelGrupo, TarjetaGrupo, type ItemAtencion, type Linea } from "@/components/repositorio-legal/Resumen";
import { datosDePagina } from "@/lib/repositorio-legal/pagina";
import { antiguedad, cifrasDe, cuentaParaCifras, documentosClave, formatearFecha, requierenAtencion, resumirSociedad, RUTA_REPOSITORIO_LEGAL } from "@/lib/repositorio-legal/modelo";

const R = RUTA_REPOSITORIO_LEGAL;
const rutaSociedad = (slug: string) => `${R}/sociedades/${slug}`;
const rutaDocumentos = (filtros: Record<string, string>) => `${R}/documentos?${new URLSearchParams(filtros).toString()}`;

export default async function ResumenRepositorioLegal() {
  const { repo, error } = await datosDePagina();
  if (!repo) return <ErrorSharePoint mensaje={error ?? ""} volver={R} />;

  const docs = repo.documentos;
  const cifras = cifrasDe(docs);
  const atencion = requierenAtencion(docs);

  const porSociedad = repo.sociedades.map((s) => ({ s, r: resumirSociedad(docs, s.slug), clave: documentosClave(docs, s.slug) }));
  // La más complicada primero: vencidos pesan más que lo que falta, y eso más que lo por vencer.
  const orden = [...porSociedad].sort((a, b) => b.r.vencidos * 3 + b.r.faltantes * 2 + b.r.porVencer - (a.r.vencidos * 3 + a.r.faltantes * 2 + a.r.porVencer) || a.s.nombre.localeCompare(b.s.nombre, "es"));

  const claveOk = porSociedad.reduce((n, x) => n + x.clave.filter((c) => c.estado === "ok").length, 0);
  const claveTotal = porSociedad.reduce((n, x) => n + x.clave.length, 0);
  const ultimaModificacion = docs.reduce<string | null>((m, d) => (d.modificado && (!m || d.modificado > m) ? d.modificado : m), null);

  // Las líneas de cada tarjeta: las sociedades con más de ese estado, con enlace al filtro exacto.
  const lineasDe = (estado: "vencido" | "por_vencer" | "sin_fecha", destacar: Linea["destacar"]): Linea[] =>
    repo.sociedades
      .map((s) => ({ s, n: docs.filter((d) => cuentaParaCifras(d) && d.sociedad === s.slug && d.estado === estado).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .map((x) => ({ etiqueta: x.s.nombre, valor: String(x.n), href: rutaDocumentos({ estado, sociedad: x.s.slug }), destacar }));

  const proximo = atencion.find((d) => d.estado === "por_vencer");

  // «Para hoy»: por sociedad, lo vencido, lo por vencer y los documentos clave que faltan.
  const items: ItemAtencion[] = [];
  for (const { s, r, clave } of orden) {
    if (r.vencidos) {
      const ej = atencion.filter((d) => d.sociedad === s.slug && d.estado === "vencido").map((d) => d.tipoNombre);
      items.push({ n: r.vencidos, texto: `${r.vencidos === 1 ? "documento vencido" : "documentos vencidos"} de ${s.nombre}`, detalle: [...new Set(ej)].join(" · "), href: rutaDocumentos({ estado: "vencido", sociedad: s.slug }), tono: "alerta" });
    }
    if (r.porVencer) {
      const ej = atencion.filter((d) => d.sociedad === s.slug && d.estado === "por_vencer").map((d) => `${d.tipoNombre} (${formatearFecha(d.vence)})`);
      items.push({ n: r.porVencer, texto: `por vencer en 30 días en ${s.nombre}`, detalle: ej.join(" · "), href: rutaDocumentos({ estado: "por_vencer", sociedad: s.slug }), tono: "aviso" });
    }
    const faltan = clave.filter((c) => c.estado === "falta");
    if (faltan.length) items.push({ n: faltan.length, texto: `${faltan.length === 1 ? "documento clave falta" : "documentos clave faltan"} en ${s.nombre}`, detalle: faltan.map((c) => c.tipo.nombre).join(" · "), href: rutaSociedad(s.slug), tono: "gris" });
  }

  return (
    <div className="space-y-7">
      <SaludDelGrupo
        ok={claveOk}
        total={claveTotal}
        actualizado={ultimaModificacion ? formatearFecha(ultimaModificacion.slice(0, 10)) : null}
        sociedades={orden.map(({ s, r, clave }) => ({ slug: s.slug, nombre: s.nombre, ok: clave.filter((c) => c.estado === "ok").length, total: clave.length, vencidos: r.vencidos, porVencer: r.porVencer }))}
        rutaSociedad={rutaSociedad}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <TarjetaGrupo titulo="Vencidos" Icono={IconAlertTriangle} tono="alerta" principal={String(cifras.vencidos)} nota="El último de su tipo y ya pasó su vigencia" href={rutaDocumentos({ estado: "vencido" })} lineas={lineasDe("vencido", "alerta")} />
        <TarjetaGrupo
          titulo="Por vencer"
          Icono={IconCalendarClock}
          tono="aviso"
          principal={String(cifras.porVencer)}
          nota={proximo ? `El próximo: ${proximo.tipoNombre}, el ${formatearFecha(proximo.vence)}` : "Nada vence en los próximos 30 días"}
          href={rutaDocumentos({ estado: "por_vencer" })}
          lineas={lineasDe("por_vencer", "aviso")}
        />
        <TarjetaGrupo titulo="Sin fecha de emisión" Icono={IconCalendarQuestion} tono="naranjo" principal={String(cifras.sinFecha)} nota={`De ${cifras.documentos} documentos: complétala renombrando el archivo`} href={rutaDocumentos({ estado: "sin_fecha" })} lineas={lineasDe("sin_fecha", true)} />
      </div>

      <ParaHoy items={items} />

      <Seccion titulo={`Sociedades · ${repo.sociedades.length}`} icono={<IconBuildingBank size={15} />}>
        <div className="escalonar grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orden.map(({ s, r, clave }) => (
            <Link key={s.slug} href={rutaSociedad(s.slug)} className={`${HOJA} group flex flex-col p-5 transition duration-300 hover:-translate-y-1 hover:border-naranjo/40`}>
              <div className="flex items-center gap-3">
                <IconoEnTile Icono={IconBuildingBank} tono={r.vencidos ? "alerta" : r.porVencer ? "aviso" : r.faltantes ? "naranjo" : "cian"} chico />
                <p className="min-w-0 flex-1 truncate font-semibold text-tinta">{s.nombre}</p>
                <IconChevronRight size={16} className="text-gris-suave transition group-hover:translate-x-0.5 group-hover:text-naranjo" />
              </div>
              <p className="mt-3 font-condensed text-3xl font-bold leading-none tabular-nums text-tinta">
                {clave.filter((c) => c.estado === "ok").length}
                <span className="text-lg text-gris">/{clave.length}</span>
              </p>
              <p className="mt-1 text-xs text-gris">documentos clave al día · {r.documentos} en total</p>
              <ul className="mt-4 space-y-1 border-t border-borde/60 pt-3 text-[13px]">
                <li className="flex items-center gap-2">
                  <span className="flex-1 text-gris">Vencidos</span>
                  <span className={`font-semibold tabular-nums ${r.vencidos ? "text-alerta" : "text-tinta"}`}>{r.vencidos}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex-1 text-gris">Por vencer</span>
                  <span className={`font-semibold tabular-nums ${r.porVencer ? "text-aviso" : "text-tinta"}`}>{r.porVencer}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex-1 text-gris">Faltan</span>
                  <span className={`font-semibold tabular-nums ${r.faltantes ? "text-naranjo" : "text-tinta"}`}>{r.faltantes}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex-1 text-gris">Última emisión</span>
                  <span className="font-semibold tabular-nums text-tinta">{r.ultimaEmision ? `${formatearFecha(r.ultimaEmision)} · ${antiguedad(r.ultimaEmision)}` : "—"}</span>
                </li>
              </ul>
            </Link>
          ))}
        </div>
      </Seccion>
    </div>
  );
}
