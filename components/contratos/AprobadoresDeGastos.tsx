"use client";

import { useState } from "react";
import { IconPencil, IconShieldCheck } from "@tabler/icons-react";
import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import VentanaModal from "./VentanaModal";
import { useFormulario } from "./useFormulario";
import { resumirResponsables } from "@/lib/contratos/plazos-modelo";
import { guardarAprobadoresAction } from "@/app/(protegido)/contratos/[contrato]/acciones-gastos";

interface Persona {
  id: string;
  nombre: string;
}

/**
 * Quién puede aprobar cotizaciones y fijar el presupuesto de Gastos de arranque.
 *
 * Los administradores siempre pueden; acá se designa a quién más. Verlo es de todo el módulo (que
 * cada quien sepa a quién pedirle una aprobación); cambiarlo es solo de los administradores.
 */
export default function AprobadoresDeGastos({
  aprobadores,
  candidatos,
  puedeEditar,
}: {
  aprobadores: Persona[];
  candidatos: Persona[];
  puedeEditar: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const cerrar = () => setAbierta(false);

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-x-2 text-xs text-gris">
        <IconShieldCheck size={14} className="text-cian" aria-hidden />
        <span>
          Aprueban: <b className="text-tinta">administradores</b>
          {aprobadores.length > 0 && (
            <>
              {" "}
              y <b className="text-tinta">{resumirResponsables(aprobadores.map((a) => a.nombre), 3)}</b>
            </>
          )}
        </span>
        {puedeEditar && (
          <button
            type="button"
            onClick={() => setAbierta(true)}
            className="inline-flex min-h-9 items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-azul hover:underline"
          >
            <IconPencil size={12} />
            Cambiar
          </button>
        )}
      </span>

      <VentanaModal
        abierta={abierta}
        alCerrar={cerrar}
        titulo="Quién aprueba"
        descripcion="Cotizaciones y presupuesto de Gastos de arranque"
        ancho="max-w-md"
      >
        <Formulario elegidos={new Set(aprobadores.map((a) => a.id))} candidatos={candidatos} alTerminar={cerrar} />
      </VentanaModal>
    </>
  );
}

function Formulario({
  elegidos,
  candidatos,
  alTerminar,
}: {
  elegidos: Set<string>;
  candidatos: Persona[];
  alTerminar: () => void;
}) {
  const { estado, enviar, pendiente } = useFormulario(async (previo, datos) => {
    const resultado = await guardarAprobadoresAction(previo, datos);
    if (resultado.ok) alTerminar();
    return resultado;
  });

  return (
    <form onSubmit={enviar} className="space-y-4">
      {candidatos.length === 0 ? (
        <p className="rounded-lg bg-fondo/60 px-3 py-4 text-center text-xs text-gris">
          Nadie más tiene Gastos de arranque asignado. Asígnalo en Usuarios y vuelve a elegir.
        </p>
      ) : (
        <fieldset>
          <legend className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-gris">
            Además de los administradores
          </legend>
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-borde p-1.5">
            {candidatos.map((p) => (
              <li key={p.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 text-sm text-tinta transition hover:bg-cian-lavado/60">
                  <input
                    type="checkbox"
                    name="aprobador"
                    value={p.id}
                    defaultChecked={elegidos.has(p.id)}
                    className="h-4 w-4 shrink-0 accent-[var(--color-azul)]"
                  />
                  <span className="min-w-0 truncate font-semibold">{p.nombre}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <p className="rounded-lg bg-fondo/60 px-3 py-2 text-[11px] leading-relaxed text-gris">
        Quienes elijas pueden aprobar cotizaciones y fijar el presupuesto total y el de cada ítem. El resto
        del equipo puede cargar y comparar cotizaciones, pero no decidir.
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
