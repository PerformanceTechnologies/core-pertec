import { Suspense } from "react";
import PlazoDelModulo from "./PlazoDelModulo";
import ResponsablesDelModulo from "./ResponsablesDelModulo";
import { hoyEnChile } from "@/lib/contratos/acreditacion-modelo";
import { listarPlazos } from "@/lib/contratos/plazos";
import { candidatosDeModulo, listarResponsablesDeModulos } from "@/lib/contratos/responsables-de-modulo";
import { esModuloConResponsables, leerPlazo, type ModuloConPlazo } from "@/lib/contratos/plazos-modelo";

async function Plazo({ modulo }: { modulo: ModuloConPlazo }) {
  const fecha = (await listarPlazos())[modulo] ?? null;
  return <PlazoDelModulo modulo={modulo} plazo={leerPlazo(fecha, hoyEnChile())} fechaGuardada={fecha} />;
}

async function Responsables({ modulo }: { modulo: ModuloConPlazo }) {
  if (!esModuloConResponsables(modulo)) return null;
  const [todos, candidatos] = await Promise.all([listarResponsablesDeModulos(), candidatosDeModulo(modulo)]);
  return <ResponsablesDelModulo modulo={modulo} responsables={todos[modulo] ?? []} candidatos={candidatos} />;
}

/**
 * La fecha límite de un submódulo y, si lo tiene, quién responde por él, para su cabecera.
 *
 * Con Suspense: son consultas aparte y no deben hacer esperar al resto de la pantalla; el hueco
 * del tamaño del botón evita que el contenido salte cuando llegan. Documentos generales solo
 * lleva la fecha: ahí el responsable es de cada requisito.
 */
export default function PlazoDeCabecera({ modulo }: { modulo: ModuloConPlazo }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Suspense fallback={<div className="h-11" aria-hidden />}>
        <Plazo modulo={modulo} />
      </Suspense>
      {esModuloConResponsables(modulo) && (
        <Suspense fallback={<div className="h-11" aria-hidden />}>
          <Responsables modulo={modulo} />
        </Suspense>
      )}
    </div>
  );
}
