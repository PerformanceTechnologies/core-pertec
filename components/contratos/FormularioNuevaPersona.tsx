"use client";

import { useState } from "react";
import BotonGuardar from "./BotonGuardar";
import ListaConOtro from "./ListaConOtro";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { CAMPO_COMPACTO } from "@/lib/contratos/estilos";
import { analizarNombre, analizarRutDePersona } from "@/lib/contratos/acreditacion-validacion";
import { formatearRut } from "@/lib/contratos/rut";
import { crearPersonaAction } from "@/app/(protegido)/contratos/[contrato]/acreditacion/acciones";

const ETIQUETA = "mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-gris";
const CON_ERROR = "border-red-300 focus:border-red-400 focus:ring-red-200";

/**
 * El alta rápida: lo mínimo para empezar. Nombre, RUT y cargo; el resto de los
 * datos se completa después en la ficha.
 *
 * Pedir los 25 campos de golpe es lo que hace que nadie dé de alta a nadie hasta
 * tener todo en la mano. Con tres campos la persona entra a la nómina el mismo
 * día que se sabe que se contrata, y el checklist ya está generado.
 *
 * Faena y turno son listas (con «Otro…»): así la nómina no termina con «CCH», «cch» y «Codelco
 * CCH» como tres faenas distintas.
 */
export default function FormularioNuevaPersona({
  cargos,
  faenas,
  turnos,
}: {
  cargos: { id: string; nombre: string }[];
  faenas: readonly string[];
  turnos: readonly string[];
}) {
  const { estado, enviar, pendiente } = useFormulario(crearPersonaAction);
  const [rut, setRut] = useState("");
  const [errorDeRut, setErrorDeRut] = useState<string | null>(null);
  const [errorDeNombre, setErrorDeNombre] = useState<string | null>(null);

  // El RUT se valida al salir del campo, no mientras se escribe: decirle «inválido» a alguien
  // que va por el tercer dígito es ruido. Si ya había un error, sí se re-evalúa en cada tecla,
  // para que desaparezca apenas queda bien.
  function validarRut(crudo: string, alSalir: boolean) {
    if (!alSalir && !errorDeRut) return;
    if (crudo.trim() === "") return setErrorDeRut(null);
    const r = analizarRutDePersona(crudo);
    setErrorDeRut(r.error);
    if (alSalir && !r.error && r.valor) setRut(formatearRut(r.valor));
  }

  return (
    <form onSubmit={enviar} className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={ETIQUETA}>Nombre completo</span>
        <input
          name="nombre"
          required
          maxLength={120}
          autoComplete="off"
          onBlur={(e) => {
            const r = analizarNombre(e.currentTarget.value);
            setErrorDeNombre(r.error);
            if (!r.error && r.valor && r.valor !== e.currentTarget.value) e.currentTarget.value = r.valor;
          }}
          aria-invalid={Boolean(errorDeNombre)}
          className={`${CAMPO_COMPACTO} ${errorDeNombre ? CON_ERROR : ""}`}
        />
        {errorDeNombre && (
          <span role="alert" className="mt-0.5 block text-[11px] font-semibold text-red-600">
            {errorDeNombre}
          </span>
        )}
      </label>

      <label className="sm:col-span-2 sm:col-span-1">
        <span className={ETIQUETA}>RUT</span>
        <input
          name="rut"
          required
          autoComplete="off"
          value={rut}
          onChange={(e) => {
            setRut(e.target.value);
            validarRut(e.target.value, false);
          }}
          onBlur={(e) => validarRut(e.target.value, true)}
          placeholder="12.345.678-9"
          aria-invalid={Boolean(errorDeRut)}
          className={`${CAMPO_COMPACTO} ${errorDeRut ? CON_ERROR : ""}`}
        />
        {errorDeRut && (
          <span role="alert" className="mt-0.5 block text-[11px] font-semibold text-red-600">
            {errorDeRut}
          </span>
        )}
      </label>

      <label className="sm:col-span-2 sm:col-span-1">
        <span className={ETIQUETA}>Cargo</span>
        <select name="cargo_id" required defaultValue="" className={CAMPO_COMPACTO}>
          <option value="" disabled>
            Elige un cargo…
          </option>
          {cargos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className={ETIQUETA}>
          Faena <span className="font-normal normal-case text-gris-suave">(opcional)</span>
        </span>
        <ListaConOtro name="faena" opciones={faenas} valorInicial={null} etiqueta="Faena" />
      </div>

      <div>
        <span className={ETIQUETA}>
          Turno <span className="font-normal normal-case text-gris-suave">(opcional)</span>
        </span>
        <ListaConOtro name="turno" opciones={turnos} valorInicial={null} etiqueta="Turno" />
      </div>

      <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
        <BotonGuardar pendiente={pendiente} cargando="Creando...">
          Dar de alta
        </BotonGuardar>
        <MensajeDeForm estado={estado} />
      </div>
    </form>
  );
}
