import "server-only";
import { recordar } from "./memoria-dashboard";
import { cargarNomina } from "./acreditacion";
import { cargarFlota } from "./vehiculos";
import { estadoDeRequisitoDesdeAvance, type Avance, type EstadoRequisito } from "./contratos-estado";
import { tipoDeCarpetaDeAcreditacion, type TipoDeAcreditacion } from "./sharepoint";
import { normalizarRut } from "./rut";
import { formatearPatente, normalizarPatente } from "./vehiculos-modelo";
import type { RequisitoLeido } from "./contratos-revision";

/**
 * Lo que Contrato DCH necesita saber de Acreditación para decir cómo van las carpetas 1.3
 * (personas) y 1.4 (vehículos).
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * Esas carpetas de Documentos generales son el ARCHIVO de cada submódulo de acreditación: una
 * carpeta por persona o por vehículo con los documentos que se cargan desde su ficha. Contrato DCH
 * las trataba como cualquier otra —contando carpetas que tienen archivos— y eso mide otra cosa:
 * «cuántos tienen algún archivo», no «cuántos de los documentos que se les exigen están cargados y
 * vigentes».
 *
 * Esa segunda pregunta solo la contesta el submódulo, que conoce el cargo o el tipo de vehículo de
 * cada uno, qué documentos pide, cuáles no aplican, cuáles vencieron y cuáles están observados. Así
 * que el avance se TOMA de ahí, con la misma cuenta de la nómina y de la flota, y Contrato DCH solo
 * lo muestra.
 */

/** Una persona o un vehículo, como lo necesita la carpeta de su expediente. */
export interface UnidadDeLaCarpeta {
  id: string;
  /** Cómo se la llama: el nombre de la persona, o la patente del vehículo. */
  nombre: string;
  /** El RUT o la descripción del vehículo: lo que va bajo el nombre. */
  detalle: string;
  activo: boolean;
  /** Sus documentos cargados y vigentes sobre los que se le exigen. */
  avance: Avance;
  /** La etapa del camino, tal cual la dice su submódulo. */
  etapa: { clave: string; etiqueta: string; completa: boolean };
  vencidos: number;
  porVencer: number;
}

export interface AcreditacionParaDocumentos {
  tipo: TipoDeAcreditacion;
  /** Documentos cargados sobre exigidos, de todas las ACTIVAS: la cuenta de la nómina o de la flota. */
  total: Avance;
  /** Cuántas personas o vehículos activos. */
  unidades: number;
  acreditadas: number;
  /** Por el id de su carpeta en SharePoint (lo guarda la ficha al crearla). */
  porCarpeta: Map<string, UnidadDeLaCarpeta>;
  /** Por RUT o patente normalizados: para las carpetas que no tienen su id anotado todavía. */
  porClave: Map<string, UnidadDeLaCarpeta>;
}

function sumarAvances(unidades: UnidadDeLaCarpeta[]): Avance {
  let exigidos = 0;
  let cargados = 0;
  let noAplican = 0;
  for (const u of unidades) {
    if (!u.activo) continue;
    exigidos += u.avance.total;
    cargados += u.avance.subidos;
    noAplican += u.avance.noAplican;
  }
  return {
    total: exigidos,
    subidos: cargados,
    pendientes: exigidos - cargados,
    noAplican,
    porcentaje: exigidos === 0 ? 0 : Math.round((cargados / exigidos) * 100),
  };
}

function armar(
  tipo: TipoDeAcreditacion,
  filas: { unidad: UnidadDeLaCarpeta; carpetaItemId: string | null; clave: string }[],
): AcreditacionParaDocumentos {
  const porCarpeta = new Map<string, UnidadDeLaCarpeta>();
  const porClave = new Map<string, UnidadDeLaCarpeta>();
  for (const f of filas) {
    if (f.carpetaItemId) porCarpeta.set(f.carpetaItemId, f.unidad);
    porClave.set(f.clave, f.unidad);
  }

  // Una baja no es parte de lo que falta (ver agruparReporte): el avance es de quienes están.
  const activas = filas.filter((f) => f.unidad.activo).map((f) => f.unidad);
  return {
    tipo,
    total: sumarAvances(activas),
    unidades: activas.length,
    acreditadas: activas.filter((u) => u.etapa.completa).length,
    porCarpeta,
    porClave,
  };
}

async function leerPersonas(): Promise<AcreditacionParaDocumentos> {
  const nomina = await cargarNomina();
  return armar(
    "personas",
    nomina.personas.map((p) => ({
      carpetaItemId: p.persona.carpetaItemId,
      clave: normalizarRut(p.persona.rut),
      unidad: {
        id: p.persona.id,
        nombre: p.persona.nombre,
        detalle: p.persona.rut,
        activo: p.persona.activo,
        avance: p.analisis.avance,
        etapa: {
          clave: p.analisis.etapa,
          etiqueta: ETIQUETAS_DE_PERSONA[p.analisis.etapa],
          completa: p.analisis.etapa === "acreditada",
        },
        vencidos: p.analisis.vencidos,
        porVencer: p.analisis.porVencer,
      },
    })),
  );
}

async function leerVehiculos(): Promise<AcreditacionParaDocumentos> {
  const flota = await cargarFlota();
  return armar(
    "vehiculos",
    flota.vehiculos.map((v) => ({
      carpetaItemId: v.vehiculo.carpetaItemId,
      clave: normalizarPatente(v.vehiculo.patente),
      unidad: {
        id: v.vehiculo.id,
        nombre: formatearPatente(v.vehiculo.patente),
        detalle: [v.vehiculo.datos.marca, v.vehiculo.datos.modelo].filter(Boolean).join(" "),
        activo: v.vehiculo.activo,
        avance: v.analisis.avance,
        etapa: {
          clave: v.analisis.etapa,
          etiqueta: ETIQUETAS_DE_VEHICULO[v.analisis.etapa],
          completa: v.analisis.etapa === "acreditado",
        },
        vencidos: v.analisis.vencidos,
        porVencer: v.analisis.porVencer,
      },
    })),
  );
}

// Las etiquetas de la etapa, aparte de los módulos de cada submódulo para no arrastrar sus tipos.
const ETIQUETAS_DE_PERSONA: Record<string, string> = {
  documentacion: "En documentación",
  web_control: "Falta Web Control",
  buk: "Falta BUK",
  acreditada: "Acreditada",
};
const ETIQUETAS_DE_VEHICULO: Record<string, string> = {
  documentacion: "En documentación",
  web_control: "Falta Web Control",
  acreditado: "Acreditado",
};

/** Recordado 30 s, como el resto de lo del tablero: lo descarta olvidarDashboard() al cambiar algo. */
export function cargarAcreditacionParaDocumentos(
  tipo: TipoDeAcreditacion = "personas",
): Promise<AcreditacionParaDocumentos> {
  return recordar(`acreditacion-en-documentos-${tipo}`, 30_000, () =>
    tipo === "vehiculos" ? leerVehiculos() : leerPersonas(),
  );
}

/** El estado del requisito «1.3» o «1.4», que ya NO es una marca a mano sino lo que dice su submódulo. */
export function estadoDeLaCarpetaDeAcreditacion(datos: AcreditacionParaDocumentos): EstadoRequisito {
  return estadoDeRequisitoDesdeAvance(datos.total);
}

/**
 * Corrige el estado de los requisitos que son una carpeta de Acreditación (la 1.3 o la 1.4).
 *
 * Se llama después de armar los requisitos con `estadoEfectivo`, que mira lo guardado y si la
 * carpeta tiene archivos: para esas carpetas ninguna de las dos cosas vale. Las demás pasan sin
 * tocar. Si el submódulo no se puede leer, se deja lo que había: una carpeta que no carga no puede
 * tumbar la pantalla donde se ve todo lo demás.
 */
export async function aplicarEstadoDeAcreditacion(requisitos: RequisitoLeido[]): Promise<RequisitoLeido[]> {
  const tipos = new Set<TipoDeAcreditacion>();
  for (const r of requisitos) {
    const tipo = tipoDeCarpetaDeAcreditacion(r.carpeta.ruta);
    if (tipo) tipos.add(tipo);
  }
  if (tipos.size === 0) return requisitos;

  const reales = new Map<TipoDeAcreditacion, EstadoRequisito>();
  await Promise.all(
    [...tipos].map(async (tipo) => {
      try {
        reales.set(tipo, estadoDeLaCarpetaDeAcreditacion(await cargarAcreditacionParaDocumentos(tipo)));
      } catch (e) {
        console.error(
          `[contratos] No se pudo leer Acreditación (${tipo}) para su carpeta: ${e instanceof Error ? e.message : e}`,
        );
      }
    }),
  );

  return requisitos.map((r) => {
    const tipo = tipoDeCarpetaDeAcreditacion(r.carpeta.ruta);
    const real = tipo ? reales.get(tipo) : undefined;
    return real ? { ...r, estado: real } : r;
  });
}

/** La persona o el vehículo dueño de una carpeta del expediente: por el id de la carpeta, o por la clave del nombre. */
export function unidadDeCarpeta(
  datos: AcreditacionParaDocumentos,
  carpeta: { id: string; nombre: string },
): UnidadDeLaCarpeta | null {
  const porId = datos.porCarpeta.get(carpeta.id);
  if (porId) return porId;

  // «12345678-5 - Nombre Apellido» o «ABCD-12 - Toyota Hilux»: la clave es lo que va antes del primer « - ».
  const clave = carpeta.nombre.split(" - ")[0]?.trim() ?? "";
  if (!clave) return null;
  return datos.porClave.get(datos.tipo === "vehiculos" ? normalizarPatente(clave) : normalizarRut(clave)) ?? null;
}

/** «3 personas · 1 acreditada · 23 de 33 documentos»: lo que dice la fila de la carpeta. */
export function detalleDeAcreditacion(datos: AcreditacionParaDocumentos): string {
  const personas = datos.tipo === "personas";
  const n = datos.unidades;
  const a = datos.acreditadas;
  return [
    `${n} ${personas ? (n === 1 ? "persona" : "personas") : n === 1 ? "vehículo" : "vehículos"}`,
    `${a} ${personas ? (a === 1 ? "acreditada" : "acreditadas") : a === 1 ? "acreditado" : "acreditados"}`,
    `${datos.total.subidos} de ${datos.total.total} documentos`,
  ].join(" · ");
}
