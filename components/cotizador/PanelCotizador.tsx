import Link from "next/link";
import type { CotizacionResumen } from "@/lib/cotizador";
import { money, pct } from "@/lib/cotizador/formato";
import { puedeEnCotizador, type RolCotizador } from "@/lib/permisos-cotizador";
import FormularioCotizacion from "./FormularioCotizacion";
import TablaCotizaciones from "./TablaCotizaciones";
import ImportarPropuesta from "./ImportarPropuesta";
import DetalleCotizaciones from "./DetalleCotizaciones";
import { crearCotizacionAction } from "@/app/(protegido)/cotizador/acciones";

export default function PanelCotizador({
  cotizaciones,
  rol,
}: {
  cotizaciones: CotizacionResumen[];
  rol: RolCotizador;
}) {
  const puedeCrear = puedeEnCotizador(rol, "crear_cotizacion");
  const puedeEliminar = puedeEnCotizador(rol, "eliminar_cotizacion");
  const puedeAdministrarParametros = puedeEnCotizador(rol, "administrar_parametros_legales");

  // Los KPI se calculan SOLO sobre cotizaciones reales: una cotización de
  // ejemplo (es_demo) tiene cifras ilustrativas, y dejarla dentro inflaba el
  // monto cotizado del portafolio con plata que no existe.
  const reales = cotizaciones.filter((c) => !c.esDemo);
  const nDemos = cotizaciones.length - reales.length;

  const totalNeto = reales.reduce((acc, c) => acc + (c.summary?.ecoTotalNeto ?? 0), 0);
  const adjudicadas = reales.filter((c) => c.estado === "adjudicada" || c.estado === "emitida").length;
  const margenProm = reales.length
    ? reales.reduce((acc, c) => acc + (c.summary?.margenEfectivoTotal ?? 0), 0) / reales.length
    : 0;
  const notaDemo = nDemos > 0 ? ` · ${nDemos} de ejemplo excluida${nDemos === 1 ? "" : "s"}` : "";

  return (
    // El <main> del core no tiene tope de ancho: sin esto, en un monitor de
    // 1900px los filtros y el título se estiran a todo lo largo.
    <div className="animar-entrada max-w-[1500px]">
      <Link
        href="/"
        className="text-xs font-medium text-tinta/50 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
      >
        ← Volver al inicio
      </Link>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <span className="etiqueta-seccion">Cotizador</span>
          {/* Tamaño de display y tracking cerrado: es el título de la página, no
              un subtítulo. Y en dos líneas, que a 2xl en una sola se leía como un
              párrafo en negrita. */}
          <h1 className="mt-2 max-w-[24ch] font-condensed text-3xl font-bold uppercase leading-[0.95] tracking-tight text-tinta sm:text-4xl">
            Cotizaciones
            <span className="block text-tinta/40">Servicios de vulcanización</span>
          </h1>
        </div>

        {/* Los enlaces de administración en fila y no apilados en una columna
            angosta: apilados a la derecha del título formaban una segunda columna
            de texto que competía con él. */}
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium lg:shrink-0">
          <Link
            href="/cotizador/catalogos"
            className="text-tinta/55 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
          >
            Catálogos →
          </Link>
          <Link
            href="/cotizador/empresas"
            className="text-tinta/55 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
          >
            Empresas →
          </Link>
          {puedeAdministrarParametros && (
            <Link
              href="/cotizador/parametros"
              className="text-tinta/55 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
            >
              Parámetros legales →
            </Link>
          )}
        </nav>
      </div>

      {/* Los tres KPI pasan a una cinta de segmentos, igual que en Rendir Gastos
          y Mi Día: mismos tintes, menos alto, y la tabla queda más arriba. Los
          rótulos salen de la caja alta — competían con el título y con los
          encabezados de la tabla. */}
      <dl className="mt-8 grid grid-cols-1 overflow-hidden rounded-2xl border border-borde sm:grid-cols-3">
        <div className="border-b border-borde bg-naranjo/[0.06] px-5 py-4 sm:border-b-0 sm:border-r">
          <dt className="text-xs font-medium text-tinta/55">Monto cotizado · neto/mes</dt>
          <dd className="mt-1 font-condensed text-2xl font-bold leading-none tracking-tight tabular-nums text-tinta sm:text-3xl">
            {money(totalNeto)}
          </dd>
          <dd className="mt-1.5 text-[11px] text-tinta/45">
            {reales.length} cotizaci{reales.length === 1 ? "ón" : "ones"}
            {notaDemo}
          </dd>
        </div>
        <div className="border-b border-borde bg-gris/[0.08] px-5 py-4 sm:border-b-0 sm:border-r">
          <dt className="text-xs font-medium text-tinta/55">Tasa de adjudicación</dt>
          <dd className="mt-1 font-condensed text-2xl font-bold leading-none tracking-tight tabular-nums text-naranjo sm:text-3xl">
            {cotizaciones.length ? pct(adjudicadas / cotizaciones.length, 0) : "—"}
          </dd>
          <dd className="mt-1.5 text-[11px] text-tinta/45">
            {adjudicadas} de {cotizaciones.length} adjudicadas o emitidas
          </dd>
        </div>
        <div className="bg-teal/[0.06] px-5 py-4">
          <dt className="text-xs font-medium text-tinta/55">Margen efectivo promedio</dt>
          <dd className="mt-1 font-condensed text-2xl font-bold leading-none tracking-tight tabular-nums text-teal sm:text-3xl">
            {pct(margenProm)}
          </dd>
          <dd className="mt-1.5 text-[11px] text-tinta/45">sobre costo mensual total</dd>
        </div>
      </dl>

      {/* El detalle cuelga de la cinta de KPI porque es el detalle de eso mismo:
          los tres números de arriba dicen cuánto hay, el modal dice dónde está
          trabado, quién concentra el monto y qué tiene el margen más flaco. */}
      <DetalleCotizaciones cotizaciones={cotizaciones} />

      {puedeCrear && (
        <details className="group mt-6">
          {/* El cuadrado naranjo gira 45 grados al abrirse, así que la cruz pasa a
              ser una equis y el mismo elemento sirve de abrir y de cerrar. */}
          <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl border border-borde bg-crema/60 px-4 py-3.5 transition-colors hover:border-naranjo/50 hover:bg-naranjo/[0.06] group-open:rounded-b-none group-open:border-b-transparent group-open:bg-superficie">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-naranjo text-base font-bold leading-none text-white transition-transform duration-200 group-open:rotate-45">
              +
            </span>
            <span className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
              Nueva cotización
            </span>
          </summary>
          <div className="rounded-b-2xl border border-t-0 border-borde bg-superficie px-4 pb-5">
            <div className="border-t border-borde pt-4">
              <FormularioCotizacion accion={crearCotizacionAction} textoBoton="Crear cotización" />
            </div>
          </div>
        </details>
      )}

      {/* Debajo de "Nueva cotización" porque es lo mismo con otro punto de
          partida: en vez de una obra en blanco, una propuesta ya escrita. */}
      {puedeCrear && <ImportarPropuesta />}

      <TablaCotizaciones cotizaciones={cotizaciones} puedeEliminar={puedeEliminar} />
    </div>
  );
}
