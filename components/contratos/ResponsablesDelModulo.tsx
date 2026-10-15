"use client";

import { useState } from "react";
import { IconPencil, IconUsers } from "@tabler/icons-react";
import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import VentanaModal from "./VentanaModal";
import { useFormulario } from "./useFormulario";
import { MODULOS_CON_PLAZO, resumirResponsables, type ModuloConResponsables } from "@/lib/contratos/plazos-modelo";
import { guardarResponsablesAction } from "@/app/(protegido)/contratos/[contrato]/acciones-plazos";
import { usePuede } from "./PermisosDelUsuario";

interface Persona {
  id: string;
  nombre: string;
}

/**
 * Quién responde por este submódulo, y el botón para cambiarlo.
 *
 * Va junto a la fecha límite en la cabecera: son las dos mitades de lo mismo —para cuándo y a
 * quién le toca—, y los responsables son quienes reciben el aviso en Mi Día cuando el plazo se
 * acerca. Puede haber más de uno, por eso es una lista de casillas y no un desplegable.
 */
export default function ResponsablesDelModulo({
  modulo,
  responsables,
  candidatos,
}: {
  modulo: ModuloConResponsables;
  responsables: Persona[];
  /** A quién se puede elegir: quienes tienen el módulo. */
  candidatos: Persona[];
}) {
  const puedeConfigurar = usePuede("configurar");
  const [abierta, setAbierta] = useState(false);
  const cerrar = () => setAbierta(false);
  const hay = responsables.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        disabled={!puedeConfigurar}
        className={`inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs transition enabled:hover:border-cian disabled:cursor-default ${
          hay ? "border-borde bg-superficie text-tinta" : "border-dashed border-borde bg-superficie text-gris"
        }`}
        aria-label={hay ? "Cambiar los responsables" : "Asignar responsables"}
        title={hay ? responsables.map((r) => r.nombre).join(", ") : undefined}
      >
        <IconUsers size={16} aria-hidden className="shrink-0" />
        {hay ? (
          <span className="min-w-0 truncate">
            <span className="font-bold">Responsables</span>
            <span className="font-semibold"> · {resumirResponsables(responsables.map((r) => r.nombre), 2)}</span>
          </span>
        ) : (
          <span className="font-bold uppercase tracking-wide">Asignar responsables</span>
        )}
        {puedeConfigurar && <IconPencil size={13} aria-hidden className="shrink-0 opacity-60" />}
      </button>

      <VentanaModal
        abierta={abierta}
        alCerrar={cerrar}
        titulo="Responsables"
        descripcion={MODULOS_CON_PLAZO[modulo].nombre}
        ancho="max-w-md"
      >
        <FormularioDeResponsables
          modulo={modulo}
          elegidos={new Set(responsables.map((r) => r.id))}
          candidatos={candidatos}
          alTerminar={cerrar}
        />
      </VentanaModal>
    </>
  );
}

function FormularioDeResponsables({
  modulo,
  elegidos,
  candidatos,
  alTerminar,
}: {
  modulo: ModuloConResponsables;
  elegidos: Set<string>;
  candidatos: Persona[];
  alTerminar: () => void;
}) {
  const { estado, enviar, pendiente } = useFormulario(async (previo, datos) => {
    const resultado = await guardarResponsablesAction(modulo, previo, datos);
    if (resultado.ok) alTerminar();
    return resultado;
  });

  return (
    <form onSubmit={enviar} className="space-y-4">
      {candidatos.length === 0 ? (
        <p className="rounded-lg bg-fondo/60 px-3 py-4 text-center text-xs text-gris">
          Nadie tiene este módulo asignado todavía. Asígnalo en Usuarios y vuelve a elegir.
        </p>
      ) : (
        <fieldset>
          <legend className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-gris">
            Quién responde por el módulo
          </legend>
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-borde p-1.5">
            {candidatos.map((p) => (
              <li key={p.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 text-sm text-tinta transition hover:bg-cian-lavado/60">
                  <input
                    type="checkbox"
                    name="responsable"
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
        Quienes elijas verán en su Mi Día lo que falta de este módulo y cuánto queda para la fecha
        límite, y lo recibirán en el correo diario. Pueden ser varios; déjalo sin marcar para quitar a
        todos.
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
