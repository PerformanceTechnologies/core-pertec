// El reporte: los mismos números de la nómina, agrupados. Sin "server-only": es
// cálculo puro sobre lo que ya leyó cargarNomina().

import type { CeldaDeDocumento, TipoDocumento } from "./acreditacion-modelo";
import type { Avance } from "./contratos-estado";

/**
 * Lo mínimo que se necesita del análisis de cada uno: sirve para una persona y para un vehículo.
 * `etapa` es un texto porque la de una persona termina en «acreditada» y la de un vehículo en
 * «acreditado»: las dos cuentan como acreditadas.
 */
export interface AnalisisParaReporte {
  avance: Avance;
  etapa: string;
  vencidos: number;
  porVencer: number;
  celdas: ReadonlyMap<string, CeldaDeDocumento>;
}

/** Lo mínimo que se necesita de cada persona (o vehículo); así no depende de dónde se leyó. */
export interface PersonaParaReporte {
  activo: boolean;
  cargo: string;
  faena: string | null;
  /** Si cuenta como contratada (activa, con fecha de ingreso y sin «sin contrato aún»). Los vehículos no lo dicen: cuentan todos. */
  contratada?: boolean;
  analisis: AnalisisParaReporte;
}

export interface FilaDeReporte {
  nombre: string;
  personas: number;
  /** De esas personas, cuántas ya cuentan como contratadas. */
  contratadas: number;
  acreditadas: number;
  /** Documentos cargados sobre documentos exigidos, de todas sus personas. */
  cargados: number;
  exigidos: number;
  porcentaje: number;
  vencidos: number;
  porVencer: number;
}

/**
 * Agrupa por una clave y suma.
 *
 * El porcentaje es de DOCUMENTOS, no el promedio de los porcentajes de las
 * personas: promediar le da el mismo peso a un Activador con 11 requisitos que a
 * un Administrador con 23, y el resultado no coincide con ningún conteo real.
 * Solo cuentan las personas activas: una baja no es parte de lo que falta.
 */
export function agruparReporte(
  personas: PersonaParaReporte[],
  clave: (p: PersonaParaReporte) => string,
): FilaDeReporte[] {
  const grupos = new Map<string, FilaDeReporte>();

  for (const p of personas) {
    if (!p.activo) continue;
    const nombre = clave(p);
    const fila =
      grupos.get(nombre) ??
      { nombre, personas: 0, contratadas: 0, acreditadas: 0, cargados: 0, exigidos: 0, porcentaje: 0, vencidos: 0, porVencer: 0 };

    fila.personas++;
    if (p.contratada ?? true) fila.contratadas++;
    if (p.analisis.etapa === "acreditada" || p.analisis.etapa === "acreditado") fila.acreditadas++;
    fila.cargados += p.analisis.avance.subidos;
    fila.exigidos += p.analisis.avance.total;
    fila.vencidos += p.analisis.vencidos;
    fila.porVencer += p.analisis.porVencer;
    grupos.set(nombre, fila);
  }

  return [...grupos.values()]
    .map((f) => ({ ...f, porcentaje: f.exigidos === 0 ? 0 : Math.round((f.cargados / f.exigidos) * 100) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export interface DocumentoFaltante {
  tipo: TipoDocumento;
  /** Personas a las que se les exige y todavía no lo cumplen. */
  faltan: number;
  /** Personas a las que se les exige. */
  exigido: number;
}

/**
 * Qué documentos faltan más, en toda la nómina.
 *
 * Es lo que responde "¿qué le pedimos a todo el mundo esta semana?": si 8 de 9
 * personas no tienen el examen preocupacional, el problema es el examen, no las
 * personas. "No aplica" y "no lo pide su cargo" no cuentan como faltantes.
 */
export function documentosMasFaltantes(
  personas: PersonaParaReporte[],
  tipos: TipoDocumento[],
): DocumentoFaltante[] {
  const filas: DocumentoFaltante[] = [];

  for (const tipo of tipos) {
    let exigido = 0;
    let faltan = 0;

    for (const p of personas) {
      if (!p.activo) continue;
      const celda = p.analisis.celdas.get(tipo.id);
      if (!celda?.requerido || celda.estado === "no_aplica") continue;
      exigido++;
      // Pendiente, observado y vencido faltan; solo "cargado" cumple.
      if (celda.estado !== "cargado") faltan++;
    }

    if (faltan > 0) filas.push({ tipo, faltan, exigido });
  }

  return filas.sort((a, b) => b.faltan - a.faltan || a.tipo.orden - b.tipo.orden);
}
