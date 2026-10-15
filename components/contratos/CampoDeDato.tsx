"use client";

import { useState } from "react";
import ListaConOtro from "./ListaConOtro";
import CampoPrevisionDeSalud from "./CampoPrevisionDeSalud";
import { CAMPO_COMPACTO } from "@/lib/contratos/estilos";
import type { CampoBase } from "@/lib/contratos/acreditacion-modelo";
import { analizarCampo, opcionesDeLista, rangoDeFecha } from "@/lib/contratos/acreditacion-validacion";

const ETIQUETA = "mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-gris";

/**
 * Un dato de la persona, con el control que le corresponde a su tipo.
 *
 *  · lista → desplegable (con «Otro…» si el campo lo permite);
 *  · comuna → desplegable con SOLO las comunas de la región elegida;
 *  · fecha → selector de fecha que ni deja elegir lo imposible (nacer en el futuro);
 *  · correo, teléfono, cuenta → se validan y se ponen en su forma normal al salir del campo, y
 *    el motivo del error se dice ahí mismo, no recién al guardar.
 *
 * La validación de acá es la MISMA del servidor (acreditacion-validacion.ts), pero solo avisa: el
 * servidor no le cree al navegador y la vuelve a hacer al guardar.
 */
export default function CampoDeDato({
  campo,
  valorInicial,
  region,
  regionInicial,
  alCambiarRegion,
  hoy,
}: {
  campo: CampoBase;
  valorInicial: string | null;
  /** La región elegida en este momento: la comuna depende de ella. */
  region: string;
  /** La región con la que se abrió la ficha. */
  regionInicial: string;
  alCambiarRegion?: (region: string) => void;
  /** La fecha de hoy en Chile, calculada en el servidor para que no discrepe al hidratar. */
  hoy: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const inicial = valorInicial ?? "";

  // La previsión tiene su propio control en dos pasos (sistema y, si es isapre, cuál): ver
  // CampoPrevisionDeSalud. Lo que envía es el mismo valor de siempre.
  if (campo.campo === "prevision_salud") return <CampoPrevisionDeSalud valorInicial={valorInicial} />;

  /** Al salir del campo: valida, y si está bien lo deja en su forma normal. */
  function alSalir(entrada: HTMLInputElement | HTMLSelectElement) {
    const r = analizarCampo(campo, entrada.value, { hoy, valores: { region } });
    setError(r.error);
    if (!r.error && r.valor !== null && r.valor !== entrada.value) entrada.value = r.valor;
  }

  const clasesError = error ? "border-red-300 focus:border-red-400 focus:ring-red-200" : "";

  let control: React.ReactNode;

  if (campo.tipo === "lista" && campo.permiteOtro && !campo.dependeDe) {
    control = (
      <ListaConOtro
        name={campo.campo}
        opciones={campo.opciones ?? []}
        valorInicial={valorInicial}
        etiqueta={campo.etiqueta}
      />
    );
  } else if (campo.tipo === "lista") {
    // Lista cerrada (o la comuna, cuyas opciones salen de la región).
    const opciones = opcionesDeLista(campo, { region });
    const esRegion = campo.campo === "region";
    // Sin región elegida no hay comunas que ofrecer; pero si la ficha ya trae una comuna, el
    // desplegable no se deshabilita: uno deshabilitado no se envía, y guardar la borraría.
    const sinPadre = Boolean(campo.dependeDe) && !region && !inicial;
    // Un valor de antes que no está en la lista se conserva como opción visible: sin eso el
    // desplegable mostraría «—» y guardar borraría un dato que sí estaba. En la comuna solo
    // mientras la región sea la de siempre: al cambiarla, la comuna vieja ya no corresponde.
    const heredado =
      inicial && !opciones.includes(inicial) && (!campo.dependeDe || region === regionInicial) ? inicial : null;

    control = (
      <select
        name={campo.campo}
        defaultValue={inicial}
        key={campo.dependeDe ? region : undefined}
        disabled={sinPadre}
        onChange={esRegion ? (e) => alCambiarRegion?.(e.target.value) : undefined}
        aria-label={campo.etiqueta}
        className={`${CAMPO_COMPACTO} disabled:cursor-not-allowed disabled:bg-fondo disabled:text-gris-suave`}
      >
        <option value="">{sinPadre ? "Elige primero la región" : "—"}</option>
        {heredado && <option value={heredado}>{heredado} (valor anterior)</option>}
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  } else if (campo.tipo === "fecha") {
    const { min, max } = rangoDeFecha(campo.campo, hoy);
    control = (
      <input
        name={campo.campo}
        type="date"
        defaultValue={inicial}
        min={min}
        max={max}
        onBlur={(e) => alSalir(e.currentTarget)}
        aria-invalid={Boolean(error)}
        className={`${CAMPO_COMPACTO} ${clasesError}`}
      />
    );
  } else if (campo.tipo === "numero") {
    control = (
      <input
        name={campo.campo}
        type="number"
        inputMode="decimal"
        defaultValue={inicial}
        min={campo.min}
        max={campo.max}
        step={campo.paso}
        placeholder={campo.marcador}
        onBlur={(e) => alSalir(e.currentTarget)}
        aria-invalid={Boolean(error)}
        className={`${CAMPO_COMPACTO} ${clasesError}`}
      />
    );
  } else {
    const tipoDeEntrada = campo.tipo === "correo" ? "email" : campo.tipo === "telefono" ? "tel" : "text";
    control = (
      <input
        name={campo.campo}
        type={tipoDeEntrada}
        inputMode={campo.tipo === "cuenta" ? "numeric" : campo.tipo === "telefono" ? "tel" : undefined}
        autoComplete="off"
        defaultValue={inicial}
        maxLength={campo.tipo === "correo" ? 254 : 200}
        placeholder={campo.marcador}
        onBlur={campo.tipo === "texto" ? undefined : (e) => alSalir(e.currentTarget)}
        aria-invalid={Boolean(error)}
        className={`${CAMPO_COMPACTO} ${clasesError}`}
      />
    );
  }

  return (
    <label className={campo.ancho === 2 ? "col-span-2" : undefined}>
      <span className={ETIQUETA}>{campo.etiqueta}</span>
      {control}
      {error && (
        <span role="alert" className="mt-0.5 block text-[11px] font-semibold leading-snug text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}
