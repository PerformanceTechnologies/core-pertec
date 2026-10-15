"use client";

import { useState } from "react";
import { IconPencil } from "@tabler/icons-react";
import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import VentanaModal from "./VentanaModal";
import { useFormulario } from "./useFormulario";
import { CAMPO } from "@/lib/contratos/estilos";
import type { EstadoForm } from "@/lib/contratos/acreditacion-modelo";
import { montoEnCampo } from "@/lib/contratos/gastos-modelo";
import {
  guardarPresupuestoAction,
  guardarPresupuestoDeItemAction,
} from "@/app/(protegido)/contratos/[contrato]/acciones-gastos";

/**
 * El botón (y la ventana) para fijar un presupuesto: el total del módulo o el de un ítem.
 *
 * Un mismo componente para los dos porque piden lo mismo —un monto en pesos, sin IVA—; cambia
 * si hay que explicar el cambio: el total exige un motivo al modificarlo (queda en el
 * historial), el de un ítem no.
 */
export default function EditorDeMontoDePresupuesto({
  tipo,
  itemId,
  titulo,
  descripcion,
  valorInicial,
  etiquetaDelBoton,
  compacto = false,
}: {
  tipo: "total" | "item";
  /** Solo para `tipo="item"`. */
  itemId?: string;
  titulo: string;
  descripcion?: string;
  valorInicial: number | null;
  etiquetaDelBoton?: string;
  /** Un lápiz sin texto, para las filas de la tabla. */
  compacto?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const cerrar = () => setAbierta(false);

  return (
    <>
      {compacto ? (
        <button
          type="button"
          onClick={() => setAbierta(true)}
          aria-label={`${etiquetaDelBoton ?? "Editar"}: ${titulo}`}
          title={etiquetaDelBoton ?? "Editar presupuesto"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gris transition hover:bg-cian-lavado hover:text-azul"
        >
          <IconPencil size={15} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAbierta(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-borde px-3 py-2 text-xs font-bold uppercase tracking-wide text-azul transition hover:border-cian"
        >
          <IconPencil size={14} />
          {etiquetaDelBoton ?? "Editar"}
        </button>
      )}

      <VentanaModal abierta={abierta} alCerrar={cerrar} titulo={titulo} descripcion={descripcion} ancho="max-w-md">
        <Formulario tipo={tipo} itemId={itemId} valorInicial={valorInicial} alTerminar={cerrar} />
      </VentanaModal>
    </>
  );
}

function Formulario({
  tipo,
  itemId,
  valorInicial,
  alTerminar,
}: {
  tipo: "total" | "item";
  itemId?: string;
  valorInicial: number | null;
  alTerminar: () => void;
}) {
  const { estado, enviar, pendiente } = useFormulario(async (previo, datos): Promise<EstadoForm> => {
    const resultado =
      tipo === "total"
        ? await guardarPresupuestoAction(previo, datos)
        : await guardarPresupuestoDeItemAction(itemId ?? "", previo, datos);
    if (resultado.ok) alTerminar();
    return resultado;
  });
  const yaDefinido = valorInicial !== null;

  return (
    <form onSubmit={enviar} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris">
          {tipo === "total" ? "Presupuesto total" : "Presupuesto del ítem"}{" "}
          <span className="font-normal normal-case text-gris-suave">(pesos, sin IVA)</span>
        </span>
        <input
          name={tipo === "total" ? "monto" : "presupuesto"}
          inputMode="numeric"
          autoComplete="off"
          placeholder="25.000.000"
          defaultValue={montoEnCampo(valorInicial)}
          className={CAMPO}
        />
      </label>

      {tipo === "total" && yaDefinido && (
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris">
            Motivo del cambio
          </span>
          <input
            name="motivo"
            maxLength={300}
            autoComplete="off"
            placeholder="Ej.: se sumó la sala de activación"
            className={CAMPO}
          />
        </label>
      )}

      <p className="rounded-lg bg-fondo/60 px-3 py-2 text-[11px] leading-relaxed text-gris">
        {tipo === "total"
          ? yaDefinido
            ? "El primer presupuesto que se definió queda guardado como el original. Cada cambio queda en el historial, con quién y por qué."
            : "Es lo que hay en total para este módulo. Después se reparte entre ítems, y el core cruza lo comprometido y lo pagado contra él."
          : "Es lo que se le asigna a este ítem. Déjalo vacío para quitarlo: el ítem sigue existiendo, solo sin presupuesto."}
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
