import { AnclaDeContrato } from "./Enlace";
import Link from "@/components/contratos/Enlace";
import { IconChevronDown, IconFileSpreadsheet, IconPlus, IconSettings } from "@tabler/icons-react";
import NavegacionAcreditacion, { type VistaDeAcreditacion } from "./NavegacionAcreditacion";
import PlazoDeCabecera from "./PlazoDeCabecera";
import { SoloSi } from "./PermisosDelUsuario";

const ITEM =
  "flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-tinta transition hover:bg-cian-lavado";

export const RAIZ_DE_VEHICULOS = "/contratos/acreditacion-vehiculos";

/**
 * La cabecera de las tres vistas de la flota: título, acciones y pestañas.
 *
 * Es el hermano de EncabezadoDeAcreditacion (Acreditación Personas) y se arma igual: lo secundario
 * va en un menú «Más» y no en botones sueltos, porque en un celular cada botón de más empuja
 * debajo del pliegue las dos acciones que se usan todos los días: buscar y dar de alta.
 */
export default function EncabezadoDeVehiculos({ actual }: { actual: VistaDeAcreditacion }) {
  return (
    <>
      <span className="etiqueta-seccion">Contratos</span>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="titular text-2xl text-azul sm:text-3xl">Acreditación Vehículos</h1>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Link
            href={`${RAIZ_DE_VEHICULOS}/nueva`}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-azul px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave sm:flex-none"
          >
            <IconPlus size={16} />
            Nuevo vehículo
          </Link>

          <details className="group relative">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-xs font-bold uppercase tracking-wide text-azul transition hover:border-cian [&::-webkit-details-marker]:hidden">
              Más
              <IconChevronDown size={14} className="transition group-open:rotate-180" />
            </summary>

            <div className="absolute right-0 z-30 mt-1.5 w-72 overflow-hidden rounded-xl border border-borde bg-superficie py-1 shadow-[0_10px_28px_-10px_rgba(15,28,51,0.25)]">
              {/* <a> y no <Link>: es una descarga, no una página. */}
              <AnclaDeContrato href={`${RAIZ_DE_VEHICULOS}/exportar`} className={ITEM}>
                <IconFileSpreadsheet size={17} className="shrink-0 text-gris" />
                Exportar la flota a Excel
              </AnclaDeContrato>
              <SoloSi capacidad="configurar">
                <Link href={`${RAIZ_DE_VEHICULOS}/configuracion`} className={`${ITEM} border-t border-borde`}>
                  <IconSettings size={17} className="shrink-0 text-gris" />
                  Configuración de tipos de vehículo
                </Link>
              </SoloSi>
            </div>
          </details>
        </div>
      </div>

      {/* Las pestañas y la fecha límite en UNA fila, para no gastar dos. En el celular se apilan,
          con la fecha arriba (col-reverse) y las pestañas pegadas a su línea; desde `sm`, pestañas a
          la izquierda, fecha a la derecha y una sola línea debajo de las dos. */}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:border-b sm:border-borde">
        <NavegacionAcreditacion actual={actual} base={RAIZ_DE_VEHICULOS} etiquetaDeLaLista="Flota" />
        <PlazoDeCabecera modulo="acreditacion-vehiculos" />
      </div>
    </>
  );
}
