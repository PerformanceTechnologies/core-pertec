"use client";

import { useState } from "react";
import BotonGuardar from "./BotonGuardar";
import ListaConOtro from "./ListaConOtro";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { CAMPO_COMPACTO } from "@/lib/contratos/estilos";
import { formatearPatente } from "@/lib/contratos/vehiculos-modelo";
import { analizarPatente } from "@/lib/contratos/vehiculos-validacion";
import { crearVehiculoAction } from "@/app/(protegido)/contratos/[contrato]/acreditacion-vehiculos/acciones";

const ETIQUETA = "mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-gris";
const CON_ERROR = "border-red-300 focus:border-red-400 focus:ring-red-200";

/**
 * El alta rápida de un vehículo: lo mínimo para empezar. Patente y tipo; el resto de los datos se
 * completa después en la ficha.
 *
 * Es el hermano de FormularioNuevaPersona, y por lo mismo: pedir todos los datos de golpe es lo que
 * hace que nadie dé de alta nada hasta tener todo en la mano. Con dos campos el vehículo entra a
 * la flota el mismo día que se sabe que se contrata, y el checklist ya está generado.
 */
export default function FormularioNuevoVehiculo({
  categorias,
  faenas,
}: {
  categorias: { id: string; nombre: string }[];
  faenas: readonly string[];
}) {
  const { estado, enviar, pendiente } = useFormulario(crearVehiculoAction);
  const [patente, setPatente] = useState("");
  const [errorDePatente, setErrorDePatente] = useState<string | null>(null);

  // La patente se valida al salir del campo, no mientras se escribe: decirle «inválida» a alguien que
  // va por la tercera letra es ruido. Si ya había un error, sí se re-evalúa en cada tecla, para que
  // desaparezca apenas queda bien.
  function validar(crudo: string, alSalir: boolean) {
    if (!alSalir && !errorDePatente) return;
    if (crudo.trim() === "") return setErrorDePatente(null);
    const r = analizarPatente(crudo);
    setErrorDePatente(r.error);
    if (alSalir && !r.error && r.valor) setPatente(formatearPatente(r.valor));
  }

  return (
    <form onSubmit={enviar} className="grid grid-cols-2 gap-x-3 gap-y-3">
      <label className="col-span-2 sm:col-span-1">
        <span className={ETIQUETA}>Patente</span>
        <input
          name="patente"
          required
          autoComplete="off"
          autoCapitalize="characters"
          value={patente}
          onChange={(e) => {
            setPatente(e.target.value);
            validar(e.target.value, false);
          }}
          onBlur={(e) => validar(e.target.value, true)}
          placeholder="BCDF-12"
          aria-invalid={Boolean(errorDePatente)}
          className={`${CAMPO_COMPACTO} uppercase ${errorDePatente ? CON_ERROR : ""}`}
        />
        {errorDePatente && (
          <span role="alert" className="mt-0.5 block text-[11px] font-semibold text-red-600">
            {errorDePatente}
          </span>
        )}
      </label>

      <label className="col-span-2 sm:col-span-1">
        <span className={ETIQUETA}>Tipo de vehículo</span>
        <select name="categoria_id" required defaultValue="" className={CAMPO_COMPACTO}>
          <option value="" disabled>
            Elige un tipo…
          </option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>

      <div className="col-span-2 sm:col-span-1">
        <span className={ETIQUETA}>
          Faena <span className="font-normal normal-case text-gris-suave">(opcional)</span>
        </span>
        <ListaConOtro name="faena" opciones={faenas} valorInicial={null} etiqueta="Faena" />
      </div>

      <div className="col-span-2 flex flex-wrap items-center gap-4">
        <BotonGuardar pendiente={pendiente} cargando="Creando...">
          Dar de alta
        </BotonGuardar>
        <MensajeDeForm estado={estado} />
      </div>
    </form>
  );
}
