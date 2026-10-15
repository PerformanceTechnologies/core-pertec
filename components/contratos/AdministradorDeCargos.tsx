"use client";

import { useState } from "react";
import { IconPencil, IconPlus, IconUsers } from "@tabler/icons-react";
import EditorDeCargo, { type GrupoDeTipos } from "./EditorDeCargo";
import VentanaModal from "./VentanaModal";
import { BOTON_PRIMARIO } from "@/lib/contratos/estilos";
import { TERMINOS_DE_CONFIGURACION, type Dominio } from "@/lib/contratos/dominio-de-acreditacion";
import {
  actualizarCargoAction,
  crearCargoAction,
  eliminarCargoAction,
} from "@/app/(protegido)/contratos/[contrato]/acreditacion/acciones";
import {
  actualizarCategoriaAction,
  crearCategoriaAction,
  eliminarCategoriaAction,
} from "@/app/(protegido)/contratos/[contrato]/acreditacion-vehiculos/acciones";

/** Lo que la lista necesita de un cargo o de un tipo de vehículo. */
export interface ItemDeConfiguracion {
  id: string;
  nombre: string;
  activo: boolean;
  /** Los documentos que pide. */
  tipoIds: string[];
  /** Cuántas personas (o vehículos) lo tienen. Uno en uso no se puede eliminar. */
  usos: number;
}

// Cada submódulo escribe en SUS tablas: el componente elige las acciones según lo que se acredita.
const ACCIONES = {
  personas: { crear: crearCargoAction, actualizar: actualizarCargoAction, eliminar: eliminarCargoAction },
  vehiculos: { crear: crearCategoriaAction, actualizar: actualizarCategoriaAction, eliminar: eliminarCategoriaAction },
} as const;

/**
 * Los cargos (o los tipos de vehículo): una lista con lo esencial de cada uno, y la edición en una
 * ventana.
 *
 * Antes eran acordeones con el formulario completo adentro, más otro formulario de «agregar»
 * al final: con seis cargos abiertos la hoja medía varias pantallas. La lista dice de un
 * vistazo lo que se busca —cuántos documentos pide cada cargo y cuánta gente lo tiene— y
 * recién al tocar «Editar» aparece el formulario, sobre la página y no dentro de ella.
 */
export default function AdministradorDeCargos({
  dominio = "personas",
  cargos,
  grupos,
  totalDocumentos,
}: {
  dominio?: Dominio;
  cargos: ItemDeConfiguracion[];
  grupos: GrupoDeTipos[];
  /** Cuántos documentos hay en el catálogo (activos): el denominador de «11 de 25». */
  totalDocumentos: number;
}) {
  // `null` = cerrada; «nuevo» = crear; un id = editar ese cargo.
  const [abierto, setAbierto] = useState<string | null>(null);
  const cerrar = () => setAbierto(null);

  const editado = cargos.find((c) => c.id === abierto);
  const activos = cargos.filter((c) => c.activo).length;
  const usos = cargos.reduce((n, c) => n + c.usos, 0);
  const t = TERMINOS_DE_CONFIGURACION[dominio];
  const acciones = ACCIONES[dominio];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gris">
          <strong className="text-tinta">{cargos.length}</strong> {t.nombreDeLaLista(cargos.length)} · {activos}{" "}
          {activos === 1 ? "activo" : "activos"} · {t.resumenDeUsos(usos)}
        </p>
        <button
          type="button"
          onClick={() => setAbierto("nuevo")}
          className={`${BOTON_PRIMARIO} inline-flex items-center gap-2`}
        >
          <IconPlus size={16} />
          {t.nuevo}
        </button>
      </div>

      {cargos.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-borde bg-superficie/60 p-10 text-center">
          <p className="text-sm font-semibold text-tinta">{t.vacioTitulo}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gris">{t.vacioTexto}</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie shadow-[var(--sombra-tarjeta)]">
          {cargos.map((c) => {
            const porcentaje = totalDocumentos === 0 ? 0 : Math.round((c.tipoIds.length / totalDocumentos) * 100);
            return (
              <li
                key={c.id}
                className={`flex flex-col gap-3 px-4 py-3.5 sm:px-5 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem_7rem_auto] lg:items-center lg:gap-5 ${
                  c.activo ? "" : "opacity-70"
                }`}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-azul">
                    {c.nombre}
                    {!c.activo && (
                      <span className="rounded-full bg-borde px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gris">
                        Desactivado
                      </span>
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gris">
                    <strong className="font-extrabold tabular-nums text-tinta">{c.tipoIds.length}</strong>{" "}
                    de {totalDocumentos} documentos
                  </p>
                  <div className="barra-estado mt-1.5" role="img" aria-label={`${porcentaje}% de los documentos`}>
                    <i style={{ width: `${porcentaje}%` }} />
                  </div>
                </div>

                <p className="inline-flex items-center gap-1.5 text-xs text-gris">
                  <IconUsers size={14} className="text-gris-suave" aria-hidden />
                  {t.usosPorFila(c.usos)}
                </p>

                <button
                  type="button"
                  onClick={() => setAbierto(c.id)}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-azul transition hover:border-cian lg:justify-self-end"
                >
                  <IconPencil size={14} />
                  Editar
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <VentanaModal
        abierta={abierto === "nuevo"}
        alCerrar={cerrar}
        titulo={t.modalNuevoTitulo}
        descripcion={t.modalNuevoDescripcion}
        ancho="max-w-3xl"
      >
        <EditorDeCargo
          dominio={dominio}
          grupos={grupos}
          guardar={acciones.crear}
          alGuardar={cerrar}
          alCancelar={cerrar}
        />
      </VentanaModal>

      <VentanaModal
        abierta={editado !== undefined}
        alCerrar={cerrar}
        titulo={t.modalEditarTitulo}
        descripcion={editado?.nombre}
        ancho="max-w-3xl"
      >
        {editado && (
          <EditorDeCargo
            // La clave fuerza un editor nuevo al pasar de un cargo a otro: sus casillas son
            // del navegador, y sin esto conservarían las del cargo anterior.
            key={editado.id}
            dominio={dominio}
            cargo={editado}
            grupos={grupos}
            guardar={(previo, form) => acciones.actualizar(editado.id, previo, form)}
            eliminar={() => acciones.eliminar(editado.id)}
            alGuardar={cerrar}
            alCancelar={cerrar}
          />
        )}
      </VentanaModal>
    </div>
  );
}
