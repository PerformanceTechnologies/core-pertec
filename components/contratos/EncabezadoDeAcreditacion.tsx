import { AnclaDeContrato } from "./Enlace";
import Link from "@/components/contratos/Enlace";
import {
  IconChevronDown,
  IconDownload,
  IconFileSpreadsheet,
  IconListDetails,
  IconPlus,
  IconReportAnalytics,
  IconSettings,
} from "@tabler/icons-react";
import NavegacionAcreditacion, { type VistaDeAcreditacion } from "./NavegacionAcreditacion";
import PlazoDeCabecera from "./PlazoDeCabecera";
import { SoloSi } from "./PermisosDelUsuario";

const ITEM =
  "flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-tinta transition hover:bg-cian-lavado";

/**
 * La cabecera de las tres vistas de la nómina: título, acciones y pestañas.
 *
 * Lo secundario va en un menú "Más" y no en botones sueltos: con cinco botones el
 * encabezado en un celular ocupa media pantalla, y las dos acciones que se usan
 * todos los días —buscar y dar de alta— quedan debajo del pliegue.
 */
export default function EncabezadoDeAcreditacion({
  actual,
  esAdmin,
}: {
  actual: VistaDeAcreditacion;
  esAdmin: boolean;
}) {
  return (
    <>
      <span className="etiqueta-seccion">Contratos</span>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="titular text-2xl text-azul sm:text-3xl">Acreditación Personas</h1>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Link
            href="/contratos/acreditacion/nueva"
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-azul px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave sm:flex-none"
          >
            <IconPlus size={16} />
            Nueva persona
          </Link>

          <details className="group relative">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-xs font-bold uppercase tracking-wide text-azul transition hover:border-cian [&::-webkit-details-marker]:hidden">
              Más
              <IconChevronDown size={14} className="transition group-open:rotate-180" />
            </summary>

            <div className="absolute right-0 z-30 mt-1.5 w-72 overflow-hidden rounded-xl border border-borde bg-superficie py-1 shadow-[0_10px_28px_-10px_rgba(15,28,51,0.25)]">
              <Link href="/contratos/acreditacion/importar" className={ITEM}>
                <IconListDetails size={17} className="shrink-0 text-gris" />
                Importar una lista de personas
              </Link>
              {/* <a> y no <Link>: es una descarga, no una página. Con Link el
                  enrutador de Next intenta navegar por dentro y pide el archivo
                  dos veces. La regla del linter no distingue un Route Handler de
                  una página, de ahí la excepción. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <AnclaDeContrato href="/contratos/acreditacion/exportar?resumen=1" className={ITEM}>
                <IconReportAnalytics size={17} className="shrink-0 text-azul" />
                <span>
                  <strong className="font-bold">Resumen completo a Excel</strong>
                  <span className="block text-[11px] text-gris-suave">
                    portada, matriz, cursos y exámenes, vencimientos, dotación
                  </span>
                </span>
              </AnclaDeContrato>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <AnclaDeContrato href="/contratos/acreditacion/exportar" className={ITEM}>
                <IconFileSpreadsheet size={17} className="shrink-0 text-gris" />
                Exportar solo la nómina a Excel
              </AnclaDeContrato>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <AnclaDeContrato href="/contratos/acreditacion/exportar?datos=1" className={ITEM}>
                <IconDownload size={17} className="shrink-0 text-gris" />
                <span>
                  Nómina con datos personales
                  {esAdmin && <span className="block text-[11px] text-gris-suave">incluye datos bancarios</span>}
                </span>
              </AnclaDeContrato>
              <SoloSi capacidad="configurar">
                <Link href="/contratos/acreditacion/configuracion" className={`${ITEM} border-t border-borde`}>
                  <IconSettings size={17} className="shrink-0 text-gris" />
                  Configuración de cargos
                </Link>
              </SoloSi>
            </div>
          </details>
        </div>
      </div>

      {/* Las pestañas y la fecha límite en UNA fila, para no gastar dos. En el celular se
          apilan, con la fecha arriba (col-reverse) y las pestañas pegadas a su línea; desde
          `sm`, pestañas a la izquierda, fecha a la derecha y una sola línea debajo de las dos. */}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:border-b sm:border-borde">
        <NavegacionAcreditacion actual={actual} />
        <PlazoDeCabecera modulo="acreditacion" />
      </div>
    </>
  );
}
