import "server-only";
import { estadosDeArchivos } from "./contratos-archivo-estados";
import type { EstadoRequisito } from "./contratos-estado";
import {
  contarArchivos,
  etapaDeRequisito,
  etapasVacias,
  type EstadoDeArchivo,
  type RevisionDeCarpeta,
} from "./documento-estado";
import { archivosDeHoja, esCarpetaDeAcreditacion, type ElementoSharePoint, type Seccion } from "./sharepoint";

/** Un requisito —una carpeta hoja— con el estado que se le muestra (ver estadoEfectivo). */
export interface RequisitoLeido {
  estado: EstadoRequisito;
  carpeta: ElementoSharePoint;
}

/**
 * En qué etapa de revisión va cada GRUPO de requisitos (una fila de la lista, o toda una
 * carpeta), en UNA sola consulta a la base.
 *
 * Por cada requisito se toman sus archivos, se busca la etapa de cada uno y el requisito
 * queda en la de su archivo MENOS avanzado (ver etapaDeRequisito). Después se cuentan los
 * requisitos de cada grupo por etapa: es lo que parte la barra de avance.
 *
 * Los archivos salen de la memoria de la estructura, no de Graph (ver archivosDeHoja), y los
 * estados de todos los grupos se piden juntos: pedirlos por requisito serían decenas de
 * consultas por pantalla.
 *
 * Un requisito «no aplica» no se mira: sale de la cuenta, y leerle los archivos sería trabajo
 * para un dato que no se muestra.
 */
export async function revisionDeGrupos(
  seccion: Seccion,
  grupos: RequisitoLeido[][],
): Promise<RevisionDeCarpeta[]> {
  const idsPorGrupo = await Promise.all(
    grupos.map((grupo) =>
      Promise.all(
        grupo.map(async (r) =>
          r.estado === "no_aplica" || r.estado === "pendiente"
            ? []
            : (await archivosDeHoja(seccion, r.carpeta)).map((a) => a.id),
        ),
      ),
    ),
  );

  const todos = [...new Set(idsPorGrupo.flat(2))];
  const guardados = await estadosDeArchivos(todos);

  return grupos.map((grupo, g) => {
    const etapas = etapasVacias();
    const archivos: Record<EstadoDeArchivo, number> = { borrador: 0, en_revision: 0, validado: 0 };

    grupo.forEach((requisito, r) => {
      const cuenta = contarArchivos(idsPorGrupo[g][r], guardados);
      // La carpeta de Acreditación (1.3) no tiene archivos que revisar uno a uno: sus documentos
      // los valida Acreditación, y su estado ya es lo que ese módulo dice (ver
      // aplicarEstadoDeAcreditacion). Completa es «validado»; mientras falte, «pendiente».
      const etapa = esCarpetaDeAcreditacion(requisito.carpeta.ruta)
        ? requisito.estado === "subido"
          ? "validado"
          : requisito.estado === "no_aplica"
            ? null
            : "pendiente"
        : etapaDeRequisito(requisito.estado, cuenta);
      if (etapa) etapas[etapa]++;
      for (const e of Object.keys(cuenta) as EstadoDeArchivo[]) archivos[e] += cuenta[e];
    });

    return { etapas, archivos };
  });
}
