"use client";

import BotonGuardar from "./BotonGuardar";
import CampoDeDato from "./CampoDeDato";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { CAMPO_COMPACTO } from "@/lib/contratos/estilos";
import type { EstadoForm } from "@/lib/contratos/acreditacion-modelo";
import { Protegido } from "./PermisosDelUsuario";
import {
  CAMPOS_DE_VEHICULO,
  SECCIONES_DE_VEHICULO,
  formatearPatente,
  type Vehiculo,
} from "@/lib/contratos/vehiculos-modelo";

const ETIQUETA = "mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-gris";
const GRILLA = "grid grid-cols-2 gap-x-3 gap-y-2.5 lg:grid-cols-4";

/**
 * Los datos del vehículo, en dos secciones: identificación y operación.
 *
 * Los campos salen de CAMPOS_DE_VEHICULO, el mismo listado que usa el servidor para leer, validar y
 * guardar: agregar un dato nuevo es una línea ahí y una columna en la base, y este formulario lo
 * muestra —con el control que le toca a su tipo— sin tocarlo. Mismos controles y misma validación
 * que los datos de una persona (CampoDeDato).
 */
export default function FormularioDatosVehiculo({
  vehiculo,
  categorias,
  guardar,
  hoy,
}: {
  vehiculo: Vehiculo;
  categorias: { id: string; nombre: string; activo: boolean }[];
  guardar: (previo: EstadoForm, form: FormData) => Promise<EstadoForm>;
  /** Hoy en Chile, calculado en el servidor para que el rango de las fechas no discrepe al hidratar. */
  hoy: string;
}) {
  const { estado, enviar, pendiente } = useFormulario(guardar);

  return (
    <form onSubmit={enviar} className="space-y-4">
<Protegido capacidad="editar">
      <fieldset className="space-y-2.5">
        <Titulo>Identidad</Titulo>
        <div className={GRILLA}>
          <label>
            <span className={ETIQUETA}>Patente</span>
            {/* Se puede corregir: el servidor valida la forma y que no la tenga otro vehículo, y la
                carpeta en SharePoint se renombra con ella. Los documentos siguen a la ficha por su
                id, no por la patente, así que no se pierde nada. */}
            <input
              name="patente"
              defaultValue={formatearPatente(vehiculo.patente)}
              required
              autoCapitalize="characters"
              spellCheck={false}
              className={`${CAMPO_COMPACTO} uppercase`}
            />
          </label>

          <label className="col-span-2">
            <span className={ETIQUETA}>Tipo de vehículo</span>
            <select name="categoria_id" required defaultValue={vehiculo.categoriaId} className={CAMPO_COMPACTO}>
              {categorias
                // Los desactivados no se ofrecen, salvo el que el vehículo ya tiene: sin él el
                // selector mentiría sobre su tipo actual.
                .filter((c) => c.activo || c.id === vehiculo.categoriaId)
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

      {SECCIONES_DE_VEHICULO.map((seccion) => (
        <fieldset key={seccion} className="space-y-2.5 border-t border-borde pt-3">
          <Titulo>{seccion}</Titulo>
          <div className={GRILLA}>
            {CAMPOS_DE_VEHICULO.filter((c) => c.seccion === seccion).map((c) => (
              <CampoDeDato
                key={c.campo}
                campo={c}
                valorInicial={vehiculo.datos[c.campo] ?? null}
                region=""
                regionInicial=""
                hoy={hoy}
              />
            ))}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-4 border-t border-borde pt-4">
        <BotonGuardar pendiente={pendiente}>Guardar datos</BotonGuardar>
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
