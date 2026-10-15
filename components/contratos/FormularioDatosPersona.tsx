"use client";

import { useState } from "react";
import BotonGuardar from "./BotonGuardar";
import BotonCreadoEnBuk from "./BotonCreadoEnBuk";
import BotonSinContrato from "./BotonSinContrato";
import CampoDeDato from "./CampoDeDato";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { CAMPO_COMPACTO } from "@/lib/contratos/estilos";
import {
  CAMPOS_DE_PERSONA,
  SECCIONES_DE_DATOS,
  type EstadoForm,
  type Persona,
} from "@/lib/contratos/acreditacion-modelo";
import { analizarNombre } from "@/lib/contratos/acreditacion-validacion";
import { formatearRut } from "@/lib/contratos/rut";
import { Protegido } from "./PermisosDelUsuario";

const ETIQUETA = "mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-gris";
const GRILLA = "grid grid-cols-2 gap-x-3 gap-y-2.5 lg:grid-cols-4";

/**
 * Los datos de la persona, en las mismas secciones que la hoja Consolidado.
 *
 * Los campos salen de CAMPOS_DE_PERSONA, el mismo listado que usa el servidor para leer, validar
 * y guardar: agregar un dato nuevo es una línea ahí y una columna en la base, y este formulario
 * lo muestra —con el control que le toca a su tipo— sin tocarlo.
 *
 * Es una grilla de cuatro columnas (dos en el teléfono) con las secciones una tras otra y
 * separadas por una línea, en vez de una columna de campos de 44 px con aire de sobra: lo que
 * antes pedía tres pantallas de scroll ahora cabe en una.
 */
export default function FormularioDatosPersona({
  persona,
  cargos,
  guardar,
  hoy,
}: {
  persona: Persona;
  cargos: { id: string; nombre: string; activo: boolean }[];
  guardar: (previo: EstadoForm, form: FormData) => Promise<EstadoForm>;
  /** Hoy en Chile, calculado en el servidor para que el rango de las fechas no discrepe al hidratar. */
  hoy: string;
}) {
  const { estado, enviar, pendiente } = useFormulario(guardar);

  // La región vive acá porque la comuna depende de ella.
  const regionInicial = persona.datos.region ?? "";
  const [region, setRegion] = useState(regionInicial);
  const [errorDeNombre, setErrorDeNombre] = useState<string | null>(null);

  return (
    <form onSubmit={enviar} className="space-y-4">
<Protegido capacidad="editar">
      <fieldset className="space-y-2.5">
        <Titulo>Identidad</Titulo>
        <div className={GRILLA}>
          <label className="col-span-2">
            <span className={ETIQUETA}>Nombre completo</span>
            <input
              name="nombre"
              required
              maxLength={120}
              defaultValue={persona.nombre}
              onBlur={(e) => {
                const r = analizarNombre(e.currentTarget.value);
                setErrorDeNombre(r.error);
                if (!r.error && r.valor && r.valor !== e.currentTarget.value) e.currentTarget.value = r.valor;
              }}
              aria-invalid={Boolean(errorDeNombre)}
              className={`${CAMPO_COMPACTO} ${errorDeNombre ? "border-red-300 focus:border-red-400 focus:ring-red-200" : ""}`}
            />
            {errorDeNombre && (
              <span role="alert" className="mt-0.5 block text-[11px] font-semibold leading-snug text-red-600">
                {errorDeNombre}
              </span>
            )}
          </label>

          <label>
            <span className={ETIQUETA}>RUT</span>
            {/* No se edita: es la llave de la ficha y el nombre de su carpeta en
                SharePoint. Cambiarlo no la renombra, la desconecta de su
                expediente. Si estaba mal, se da de baja y se crea de nuevo. */}
            <input
              value={formatearRut(persona.rut)}
              readOnly
              className={`${CAMPO_COMPACTO} cursor-not-allowed bg-fondo text-gris`}
            />
          </label>

          <label>
            <span className={ETIQUETA}>Cargo</span>
            <select name="cargo_id" required defaultValue={persona.cargoId} className={CAMPO_COMPACTO}>
              {cargos
                // Los desactivados no se ofrecen, salvo el que la persona ya tiene:
                // sin él el selector mentiría sobre su cargo actual.
                .filter((c) => c.activo || c.id === persona.cargoId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.activo ? "" : " (desactivado)"}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </fieldset>

      {SECCIONES_DE_DATOS.map((seccion) => (
        <fieldset key={seccion} className="space-y-2.5 border-t border-borde pt-3">
          <Titulo>{seccion}</Titulo>
          <div className={GRILLA}>
            {CAMPOS_DE_PERSONA.filter((c) => c.seccion === seccion).map((c) => (
              <CampoDeDato
                key={c.campo}
                campo={c}
                valorInicial={persona.datos[c.campo] ?? null}
                region={region}
                regionInicial={regionInicial}
                alCambiarRegion={setRegion}
                hoy={hoy}
              />
            ))}

            {seccion === "Contrato" && (
              <label className="flex min-h-10 items-center gap-2 self-end text-sm text-tinta">
                <input
                  type="checkbox"
                  name="indefinido"
                  defaultChecked={persona.indefinido}
                  className="h-4 w-4 rounded border-borde text-azul focus:ring-cian"
                />
                Contrato indefinido
              </label>
            )}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-4 border-t border-borde pt-4">
        <BotonGuardar pendiente={pendiente}>Guardar datos</BotonGuardar>
        <BotonCreadoEnBuk personaId={persona.id} creado={persona.creadoEnBuk} />
        <BotonSinContrato
          personaId={persona.id}
          sinContrato={persona.sinContrato}
          tieneFechaDeIngreso={Boolean(persona.datos.fecha_ingreso)}
        />
        <MensajeDeForm estado={estado} />
      </div>
    </Protegido>
</form>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <legend className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gris">
      <span className="h-[2px] w-3 rounded-full bg-cian" />
      {children}
    </legend>
  );
}
