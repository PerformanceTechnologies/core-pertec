"use client";

import { useState } from "react";
import { IconCalendarEvent, IconPencil } from "@tabler/icons-react";
import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import VentanaModal from "./VentanaModal";
import { useFormulario } from "./useFormulario";
import { CAMPO } from "@/lib/contratos/estilos";
import { fechaCorta } from "@/lib/contratos/acreditacion-modelo";
import {
  MODULOS_CON_PLAZO,
  textoDePlazo,
  type LecturaDePlazo,
  type ModuloConPlazo,
} from "@/lib/contratos/plazos-modelo";
import { guardarPlazoAction } from "@/app/(protegido)/contratos/[contrato]/acciones-plazos";
import { usePuede } from "./PermisosDelUsuario";

/** Cada estado con su color: rojo vencido, ámbar por vencer, y neutro si hay tiempo. */
const CLASES: Record<LecturaDePlazo["estado"], string> = {
  vencido: "border-red-200 bg-red-50 text-red-700",
  hoy: "border-amber-200 bg-amber-50 text-amber-700",
  por_vencer: "border-amber-200 bg-amber-50 text-amber-700",
  al_dia: "border-borde bg-superficie text-gris",
};

/**
 * La fecha límite de un submódulo, y el botón para fijarla o cambiarla.
 *
 * Va en la cabecera de cada submódulo (Documentos generales, Acreditación, Logística, Gastos
 * de arranque). Hoy solo se guarda y se muestra: es la base para que más adelante se
 * configuren alarmas y recordatorios, que necesitan saber para cuándo es cada cosa.
 *
 * El color cuenta la urgencia sin leer la fecha —rojo vencida, ámbar a menos de dos
 * semanas—, y el texto la dice igual: el color solo no lo distingue quien no ve bien.
 */
export default function PlazoDelModulo({
  modulo,
  plazo,
  fechaGuardada,
}: {
  modulo: ModuloConPlazo;
  /** Ya leído en el servidor con la fecha de hoy en Chile; null si no hay fecha. */
  plazo: LecturaDePlazo | null;
  fechaGuardada: string | null;
}) {
  const puedeConfigurar = usePuede("configurar");
  const [abierta, setAbierta] = useState(false);
  const cerrar = () => setAbierta(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        disabled={!puedeConfigurar}
        className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-xs transition enabled:hover:border-cian disabled:cursor-default ${
          plazo ? CLASES[plazo.estado] : "border-dashed border-borde bg-superficie text-gris"
        }`}
        aria-label={plazo ? "Cambiar la fecha límite" : "Definir la fecha límite"}
      >
        <IconCalendarEvent size={16} aria-hidden className="shrink-0" />
        {plazo ? (
          <span>
            <span className="font-bold">Límite {fechaCorta(plazo.fecha)}</span>
            <span className="font-semibold"> · {textoDePlazo(plazo)}</span>
          </span>
        ) : (
          <span className="font-bold uppercase tracking-wide">Definir fecha límite</span>
        )}
        {puedeConfigurar && <IconPencil size={13} aria-hidden className="shrink-0 opacity-60" />}
      </button>

      <VentanaModal
        abierta={abierta}
        alCerrar={cerrar}
        titulo="Fecha límite"
        descripcion={MODULOS_CON_PLAZO[modulo].nombre}
        ancho="max-w-md"
      >
        <FormularioDePlazo modulo={modulo} fechaGuardada={fechaGuardada} alTerminar={cerrar} />
      </VentanaModal>
    </>
  );
}

function FormularioDePlazo({
  modulo,
  fechaGuardada,
  alTerminar,
}: {
  modulo: ModuloConPlazo;
  fechaGuardada: string | null;
  alTerminar: () => void;
}) {
  const { estado, enviar, pendiente } = useFormulario(async (previo, datos) => {
    const resultado = await guardarPlazoAction(modulo, previo, datos);
    if (resultado.ok) alTerminar();
    return resultado;
  });

  return (
    <form onSubmit={enviar} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris">
          Fecha límite
        </span>
        <input type="date" name="fecha" defaultValue={fechaGuardada ?? ""} className={CAMPO} />
      </label>

      <p className="rounded-lg bg-fondo/60 px-3 py-2 text-[11px] leading-relaxed text-gris">
        Es la fecha para la que debe estar completo este módulo. Se muestra en su cabecera y en su
        tarjeta de Contrato DCH, en ámbar a menos de dos semanas y en rojo si ya pasó. Más adelante
        servirá para recordatorios. Déjala vacía y guarda para quitarla.
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-4">
        <BotonGuardar pendiente={pendiente}>Guardar</BotonGuardar>
        <button
          type="button"
          onClick={alTerminar}
          className="min-h-11 px-2 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
        >
          Cancelar
        </button>
        <MensajeDeForm estado={estado} />
      </div>
    </form>
  );
}
