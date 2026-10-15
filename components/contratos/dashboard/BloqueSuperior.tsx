import CronogramaDelContrato from "./CronogramaDelContrato";
import HeroDelTablero from "./HeroDelTablero";
import IndicadoresClave from "./IndicadoresClave";
import RequiereAtencion from "./RequiereAtencion";
import {
  armarCronograma,
  armarIndicadores,
  armarLineaDeTiempo,
  armarModulos,
  avanceGeneral,
  reunirAtencion,
  saludDelContrato,
  textoDeInicio,
  type DatosDelTablero,
  type PlazosDelTablero,
  type ResponsablesDelTablero,
} from "@/lib/contratos/dashboard-modelo";

/**
 * Todo lo de arriba del dashboard: el estado general, los indicadores, el cronograma y lo que
 * requiere atención.
 *
 * Es presentacional: recibe los datos ya leídos y los pasa por las funciones puras de
 * dashboard-modelo.ts. Por eso la misma pieza sirve para la página real y para probarla con datos
 * de ejemplo sin tocar la base ni SharePoint.
 */
export default function BloqueSuperior({
  datos,
  plazos,
  responsables,
  contrato,
  hoy,
}: {
  datos: DatosDelTablero;
  plazos: PlazosDelTablero;
  responsables?: ResponsablesDelTablero;
  contrato: { nombre: string; fechaInicio: string | null; administrador: string | null };
  hoy: string;
}) {
  const modulos = armarModulos(datos, plazos, responsables);
  const general = avanceGeneral(modulos);

  const base = {
    modulos,
    acreditacion: datos.acreditacion,
    vehiculos: datos.vehiculos,
    logistica: datos.logistica,
    gastos: datos.gastos,
  };
  // La lista completa para contar y para el semáforo; la corta para mostrar.
  const todas = reunirAtencion({ ...base, limite: Infinity });
  const visibles = todas.slice(0, 8);

  return (
    <div className="space-y-4">
      <HeroDelTablero
        contrato={contrato.nombre}
        administrador={contrato.administrador}
        inicio={textoDeInicio(contrato.fechaInicio, hoy)}
        general={general}
        salud={saludDelContrato(todas, general.medidos)}
        atenciones={todas}
        modulos={modulos}
      />

      <IndicadoresClave indicadores={armarIndicadores(datos, todas.length)} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <CronogramaDelContrato
          linea={armarLineaDeTiempo(modulos, contrato.fechaInicio, hoy)}
          filas={armarCronograma(modulos)}
        />
        <RequiereAtencion items={visibles} total={todas.length} />
      </div>
    </div>
  );
}
