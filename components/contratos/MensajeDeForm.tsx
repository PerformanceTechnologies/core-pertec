import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import type { EstadoForm } from "@/lib/contratos/acreditacion-modelo";

/**
 * El resultado de enviar un formulario, debajo del botón.
 *
 * Un error se queda hasta el siguiente envío; el "Guardado" también, sin
 * temporizador: desaparecer solo a los dos segundos es el momento exacto en que
 * la persona estaba mirando otra cosa.
 */
export default function MensajeDeForm({ estado }: { estado: EstadoForm }) {
  if (estado.error) {
    return (
      <p role="alert" className="flex items-start gap-1.5 text-xs font-semibold text-red-600">
        <IconAlertTriangle size={15} className="mt-px shrink-0" />
        {estado.error}
      </p>
    );
  }
  if (estado.ok) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
        <IconCheck size={15} className="shrink-0" />
        Guardado
      </p>
    );
  }
  return null;
}
