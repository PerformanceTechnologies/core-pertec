"use client";

import { useState } from "react";
import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { CAMPO_COMPACTO } from "@/lib/contratos/estilos";
import {
  ETIQUETAS_WEB_CONTROL,
  type EstadoForm,
  type EstadoWebControl,
  type Persona,
} from "@/lib/contratos/acreditacion-modelo";
import { ESTADOS_DE_PASE } from "@/lib/contratos/acreditacion-catalogos";
import { analizarNumeroDePase } from "@/lib/contratos/acreditacion-validacion";
import { Protegido } from "./PermisosDelUsuario";

const ETIQUETA = "mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-gris";
const CASILLA =
  "flex min-h-10 pointer-coarse:min-h-11 items-center gap-2 rounded-lg border border-borde px-3 text-sm text-tinta transition has-[:checked]:border-cian/60 has-[:checked]:bg-cian-lavado";

/**
 * Web Control, BUK y pase: lo que pasa fuera de los documentos.
 *
 * Son afirmaciones de quien las marca, no un reflejo de esos sistemas: el core
 * no consulta Web Control ni BUK. Por eso son casillas y no estados calculados.
 *
 * El estatus del pase es una lista cerrada (el servidor la hace cumplir), salvo que la ficha traiga
 * un valor de antes de que existiera la lista: ese se muestra y se conserva mientras no se toque.
 */
export default function FormularioSeguimiento({
  persona,
  guardar,
}: {
  persona: Persona;
  guardar: (previo: EstadoForm, form: FormData) => Promise<EstadoForm>;
}) {
  const { estado, enviar, pendiente } = useFormulario(guardar);
  const [errorDePase, setErrorDePase] = useState<string | null>(null);

  const estadoActual = persona.estadoPase ?? "";
  const heredado = estadoActual && !(ESTADOS_DE_PASE as readonly string[]).includes(estadoActual);

  return (
    <form onSubmit={enviar} className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
<Protegido capacidad="editar">
      <label className="sm:col-span-2">
        <span className={ETIQUETA}>Documentación en Web Control</span>
        <select name="estado_web_control" defaultValue={persona.estadoWebControl} className={CAMPO_COMPACTO}>
          {(Object.keys(ETIQUETAS_WEB_CONTROL) as EstadoWebControl[]).map((k) => (
            <option key={k} value={k}>
              {ETIQUETAS_WEB_CONTROL[k]}
            </option>
          ))}
        </select>
      </label>

      <label className={CASILLA}>
        <input
          type="checkbox"
          name="wc_acreditado"
          defaultChecked={persona.wcAcreditado}
          className="h-4 w-4 rounded border-borde text-azul focus:ring-cian"
        />
        Acreditado en Web Control
      </label>

      <label className={CASILLA}>
        <input
          type="checkbox"
          name="creado_en_buk"
          defaultChecked={persona.creadoEnBuk}
          className="h-4 w-4 rounded border-borde text-azul focus:ring-cian"
        />
        Creado en BUK
      </label>

      <label>
        <span className={ETIQUETA}>N.º de pase</span>
        <input
          name="numero_pase"
          maxLength={60}
          defaultValue={persona.numeroPase ?? ""}
          onBlur={(e) => {
            const r = analizarNumeroDePase(e.currentTarget.value);
            setErrorDePase(r.error);
            if (!r.error && r.valor !== null && r.valor !== e.currentTarget.value) e.currentTarget.value = r.valor;
          }}
          aria-invalid={Boolean(errorDePase)}
          className={`${CAMPO_COMPACTO} ${errorDePase ? "border-red-300 focus:border-red-400 focus:ring-red-200" : ""}`}
        />
        {errorDePase && (
          <span role="alert" className="mt-0.5 block text-[11px] font-semibold leading-snug text-red-600">
            {errorDePase}
          </span>
        )}
      </label>

      <label>
        <span className={ETIQUETA}>Estatus del pase</span>
        <select name="estado_pase" defaultValue={estadoActual} className={CAMPO_COMPACTO}>
          <option value="">—</option>
          {heredado && <option value={estadoActual}>{estadoActual} (valor anterior)</option>}
          {ESTADOS_DE_PASE.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </label>

      <label className="sm:col-span-2">
        <span className={ETIQUETA}>Observaciones</span>
        <textarea
          name="observaciones"
          rows={2}
          maxLength={1000}
          defaultValue={persona.observaciones ?? ""}
          className={`${CAMPO_COMPACTO} resize-y`}
        />
      </label>

      <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
        <BotonGuardar pendiente={pendiente}>Guardar seguimiento</BotonGuardar>
        <MensajeDeForm estado={estado} />
      </div>
    </Protegido>
</form>
  );
}
