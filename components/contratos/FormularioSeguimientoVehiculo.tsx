"use client";

import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { CAMPO_COMPACTO } from "@/lib/contratos/estilos";
import type { EstadoForm } from "@/lib/contratos/acreditacion-modelo";
import { Protegido } from "./PermisosDelUsuario";
import {
  ESTADOS_WEB_CONTROL_VEHICULO,
  ETIQUETAS_WEB_CONTROL_VEHICULO,
  type Vehiculo,
} from "@/lib/contratos/vehiculos-modelo";

const ETIQUETA = "mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-gris";
const CASILLA =
  "flex min-h-10 pointer-coarse:min-h-11 items-center gap-2 rounded-lg border border-borde px-3 text-sm text-tinta transition has-[:checked]:border-cian/60 has-[:checked]:bg-cian-lavado";

/**
 * Web Control: lo que pasa fuera de los documentos.
 *
 * Son afirmaciones de quien las marca, no un reflejo de ese sistema: el core no consulta Web
 * Control. Por eso son una lista y una casilla, y no estados calculados.
 */
export default function FormularioSeguimientoVehiculo({
  vehiculo,
  guardar,
}: {
  vehiculo: Vehiculo;
  guardar: (previo: EstadoForm, form: FormData) => Promise<EstadoForm>;
}) {
  const { estado, enviar, pendiente } = useFormulario(guardar);

  return (
    <form onSubmit={enviar} className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
<Protegido capacidad="editar">
      <label>
        <span className={ETIQUETA}>Documentación en Web Control</span>
        <select name="estado_web_control" defaultValue={vehiculo.estadoWebControl} className={CAMPO_COMPACTO}>
          {ESTADOS_WEB_CONTROL_VEHICULO.map((k) => (
            <option key={k} value={k}>
              {ETIQUETAS_WEB_CONTROL_VEHICULO[k]}
            </option>
          ))}
        </select>
      </label>

      <label className={`${CASILLA} self-end`}>
        <input
          type="checkbox"
          name="wc_acreditado"
          defaultChecked={vehiculo.wcAcreditado}
          className="h-4 w-4 rounded border-borde text-azul focus:ring-cian"
        />
        Acreditado en Web Control
      </label>

      <label className="sm:col-span-2">
        <span className={ETIQUETA}>Observaciones</span>
        <textarea
          name="observaciones"
          rows={2}
          maxLength={1000}
          defaultValue={vehiculo.observaciones ?? ""}
          className={`${CAMPO_COMPACTO} resize-y`}
        />
      </label>

      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <BotonGuardar pendiente={pendiente}>Guardar seguimiento</BotonGuardar>
        <MensajeDeForm estado={estado} />
      </div>
    </Protegido>
</form>
  );
}
