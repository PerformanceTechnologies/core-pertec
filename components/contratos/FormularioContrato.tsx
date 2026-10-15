"use client";

import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { CAMPO } from "@/lib/contratos/estilos";
import type { EstadoForm } from "@/lib/contratos/acreditacion-modelo";

const ETIQUETA = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris";

/** La cabecera de la hoja Consolidado: nombre, inicio y administrador del contrato. */
export default function FormularioContrato({
  valores,
  guardar,
}: {
  valores: { nombre: string; fechaInicio: string | null; administrador: string | null };
  guardar: (previo: EstadoForm, form: FormData) => Promise<EstadoForm>;
}) {
  const { estado, enviar, pendiente } = useFormulario(guardar);

  return (
    <form onSubmit={enviar} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <label>
        <span className={ETIQUETA}>Nombre del contrato</span>
        <input name="nombre" required maxLength={120} defaultValue={valores.nombre} className={CAMPO} />
      </label>
      <label>
        <span className={ETIQUETA}>Fecha de inicio</span>
        <input name="fecha_inicio" type="date" defaultValue={valores.fechaInicio ?? ""} className={CAMPO} />
      </label>
      <label>
        <span className={ETIQUETA}>Administrador del contrato</span>
        <input
          name="administrador"
          maxLength={120}
          defaultValue={valores.administrador ?? ""}
          className={CAMPO}
        />
      </label>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-3">
        <BotonGuardar pendiente={pendiente}>Guardar</BotonGuardar>
        <MensajeDeForm estado={estado} />
      </div>
    </form>
  );
}
