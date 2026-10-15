"use client";

import { useState } from "react";
import { IconArrowUpRight } from "@tabler/icons-react";
import { DetalleDeDotacion, FormularioDeDotacion, type CargoParaDotacion } from "./DotacionDeContrato";
import VentanaModal from "./VentanaModal";
import type { ResumenDeDotacion } from "@/lib/contratos/acreditacion-modelo";
import { TERMINOS_DE_CONFIGURACION, type Dominio } from "@/lib/contratos/dominio-de-acreditacion";

export interface TarjetaDeResumen {
  clave: string;
  etiqueta: string;
  valor: string;
  ayuda?: string;
  /** El color del número: verde si va bien, ámbar si hay algo que mirar. */
  tono?: "ok" | "aviso";
  /**
   * 0–100. Solo la llevan las tarjetas que miden un AVANCE (el global y la dotación): se
   * dibujan distinto —fondo teñido y una barra— para no confundirlas con las que solo cuentan.
   */
  progreso?: number;
  titulo: string;
  descripcion?: string;
  /** El detalle completo, ya armado en el servidor. */
  detalle: React.ReactNode;
}

/**
 * Las cinco tarjetas del resumen de la nómina, cada una con su detalle en una ventana.
 *
 * Son botones: tocar una abre un detalle completo —quiénes son, cuáles faltan— en una ventana
 * chica, sin salir de la nómina ni recargar. Cuentan lo mismo que antes; lo que cambia es que ya
 * no hay que adivinar qué hay detrás de un «3».
 *
 * Las que miden un avance (el porcentaje global y la dotación) se ven distintas de las que
 * cuentan: fondo teñido y una barra, para que un «45%» no se lea como un conteo.
 *
 * La dotación es la quinta tarjeta y la única con un formulario: su ventana trae el detalle y un
 * botón que abre la edición de la meta.
 */
export default function TarjetasDeResumen({
  dominio = "personas",
  tarjetas,
  dotacion,
}: {
  /** Qué se acredita: decide cómo se llama lo de la dotación. */
  dominio?: Dominio;
  tarjetas: TarjetaDeResumen[];
  dotacion: {
    resumen: ResumenDeDotacion;
    totalDelContrato: number | null;
    cargos: CargoParaDotacion[];
  };
}) {
  // `null` = ninguna ventana; una clave = el detalle de esa tarjeta; «editar-dotacion» = el formulario.
  const [abierta, setAbierta] = useState<string | null>(null);
  const cerrar = () => setAbierta(null);

  const { resumen } = dotacion;
  const t = TERMINOS_DE_CONFIGURACION[dominio];
  const tarjetaDeDotacion: TarjetaDeResumen = {
    clave: "dotacion",
    etiqueta: "Dotación",
    valor: resumen.meta === null ? "—" : `${resumen.contratadas}/${resumen.meta}`,
    ayuda:
      resumen.meta === null
        ? "Definir cuántas contratar"
        : resumen.faltan > 0
          ? `faltan ${resumen.faltan} por contratar`
          : "meta cumplida",
    tono: resumen.meta !== null && resumen.faltan === 0 ? "ok" : resumen.faltan > 0 ? "aviso" : undefined,
    progreso: resumen.meta === null ? undefined : resumen.porcentaje,
    titulo: "Dotación a contratar",
    descripcion: t.dotacionDescripcion,
    detalle: null,
  };

  const todas = [...tarjetas, tarjetaDeDotacion];

  return (
    <>
      <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {todas.map((t, i) => {
          const color = t.tono === "ok" ? "text-emerald-600" : t.tono === "aviso" ? "text-amber-600" : "text-tinta";
          const conAvance = t.progreso !== undefined || t.clave === "dotacion";
          // Son cinco en una rejilla de dos: la última quedaba sola, con un hueco
          // al lado que se lee como una tarjeta que no cargó. Ocupando el ancho
          // entero, la fila se cierra —y justo esa es la de la dotación, que
          // lleva barra de avance y se ve mejor ancha.
          const cierraLaFila = todas.length % 2 === 1 && i === todas.length - 1;
          return (
            <li key={t.clave} className={cierraLaFila ? "col-span-2 sm:col-span-1" : undefined}>
              <button
                type="button"
                onClick={() => setAbierta(t.clave)}
                aria-haspopup="dialog"
                aria-label={`${t.etiqueta}: ${t.valor}. Ver detalle`}
                className={`group relative flex h-full min-h-[5.5rem] w-full flex-col rounded-xl border p-3 text-left shadow-[var(--sombra-tarjeta)] transition hover:border-cian hover:shadow-[var(--sombra-tarjeta-alta)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cian ${
                  conAvance
                    ? "border-cian/40 bg-gradient-to-br from-cian-lavado/80 to-superficie"
                    : "border-borde bg-superficie"
                }`}
              >
                <IconArrowUpRight
                  size={13}
                  aria-hidden
                  className="absolute right-2.5 top-2.5 text-gris-suave opacity-60 transition group-hover:text-cian-texto group-hover:opacity-100"
                />
                {/* Solo contenido en línea (span): un <button> no admite <p>, <div> ni <dt>/<dd>. */}
                <span className="block pr-4 text-[10px] font-bold uppercase leading-tight tracking-wide text-gris">
                  {t.etiqueta}
                </span>
                <span className={`mt-1 block text-xl font-extrabold leading-none tabular-nums ${color}`}>
                  {t.valor}
                </span>
                {t.ayuda && (
                  // Dos líneas en el teléfono en vez de cortar: "documentos
                  // vencidos o por vencer" terminaba en "o por…", que no dice
                  // nada. Desde sm hay ancho de sobra y vuelve a una línea.
                  <span className="mt-1 block text-[10px] leading-tight text-gris-suave line-clamp-2 sm:truncate">
                    {t.ayuda}
                  </span>
                )}
                {t.clave === "dotacion" && resumen.sinContrato > 0 && (
                  // Siete en la nómina y una con contrato no es «1 persona»: la tarjeta lo dice sin
                  // agrandarse, con las dos cifras y la barra en dos tonos.
                  <span className="mt-1 block text-[10px] font-semibold leading-tight text-gris">
                    {resumen.registradas} registradas · {resumen.contratadas} {resumen.contratadas === 1 ? "contratada" : "contratadas"}
                  </span>
                )}
                {t.progreso !== undefined && (
                  <span className="barra-estado relative mt-auto block" aria-hidden>
                    {t.clave === "dotacion" && resumen.sinContrato > 0 && (
                      <i
                        className="absolute inset-y-0 left-0 opacity-35"
                        style={{ width: `${resumen.porcentajeRegistradas}%` }}
                      />
                    )}
                    <i className="relative" style={{ width: `${t.progreso}%` }} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {tarjetas.map((t) => (
        <VentanaModal
          key={t.clave}
          abierta={abierta === t.clave}
          alCerrar={cerrar}
          titulo={t.titulo}
          descripcion={t.descripcion}
          ancho="max-w-lg"
        >
          {t.detalle}
        </VentanaModal>
      ))}

      <VentanaModal
        abierta={abierta === "dotacion"}
        alCerrar={cerrar}
        titulo={tarjetaDeDotacion.titulo}
        descripcion={tarjetaDeDotacion.descripcion}
        ancho="max-w-lg"
      >
        <DetalleDeDotacion dominio={dominio} resumen={resumen} alEditar={() => setAbierta("editar-dotacion")} />
      </VentanaModal>

      <VentanaModal
        abierta={abierta === "editar-dotacion"}
        alCerrar={cerrar}
        titulo="Editar dotación"
        descripcion={t.dotacionEditarDescripcion}
        ancho="max-w-xl"
      >
        <FormularioDeDotacion
          dominio={dominio}
          totalDelContrato={dotacion.totalDelContrato}
          cargos={dotacion.cargos}
          alTerminar={cerrar}
        />
      </VentanaModal>
    </>
  );
}
