// -----------------------------------------------------------------------------
//  «Ordenar el repositorio»: el plan para dejar SharePoint ordenado por sociedad. Reglas puras: se
//  calculan sobre el árbol real (en el Core) y sobre una lista de nombres (en las pruebas).
//
//  Qué hace con cada archivo:
//   · COPIA IDÉNTICA (mismo contenido) → se elimina; se queda una sola, la de la carpeta de la sociedad
//     o, si no hay, la modificada más recientemente.
//   · VERSIÓN ANTERIOR (mismo tipo y sociedad, emisión más vieja) → se elimina solo si se pide.
//   · NO LEGAL (cotizaciones, formularios por completar, fotos de WhatsApp, claves, comprobantes…) o sin
//     sociedad → «POR REVISAR/<sociedad>», para que alguien decida.
//   · Todo lo demás → «SOCIEDADES/<sociedad>/<categoría>/<nombre profesional>».
//  Las carpetas de solicitudes quedan vacías y se borran al final: sus documentos únicos ya se movieron
//  a su sociedad. La malla societaria no se toca.
// -----------------------------------------------------------------------------

import {
  CATEGORIAS,
  claveDeSociedad,
  formatearFecha,
  normalizar,
  reconocerTipo,
  siglaDeSociedad,
  TIPO_POR_ID,
  sinExtension,
  type Documento,
  type SociedadBase,
} from "./modelo";

export const CARPETA_SOCIEDADES = "SOCIEDADES";
export const CARPETA_POR_REVISAR = "POR REVISAR";

export type Accion = "mover" | "mantener" | "revisar" | "eliminar";

export interface Operacion {
  id: string;
  rutaActual: string;
  accion: Accion;
  /** Carpeta de destino, relativa al repositorio (mover y revisar). */
  destino: string | null;
  /** Nombre final del archivo (mover y revisar). */
  nombre: string | null;
  motivo: string;
  sociedad: string | null;
  tipo: string;
  tamano: number;
}

export interface OpcionesOrden {
  /** También eliminar las versiones anteriores de un mismo documento (las que el Core marca «Reemplazado»). */
  eliminarVersionesAnteriores?: boolean;
  /**
   * El nombre de la carpeta de cada sociedad (slug → nombre). Por omisión, su nombre limpio
   * («Legales VULCAMIN SPA» → «Vulcamin SpA»). Sirve también para RENOMBRAR una sociedad: sus documentos
   * pasan a la carpeta con el nombre nuevo.
   */
  carpetas?: Record<string, string>;
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Títulos cortos por tipo. Los que no están acá usan el nombre original, limpio. */
const TITULO: Record<string, string> = {
  constitucion: "Escritura de constitución",
  saneamiento: "Escritura de saneamiento",
  "modificacion-estatutos": "Modificación de estatutos",
  "extracto-do": "Extracto Diario Oficial",
  "acta-junta": "Acta de junta de accionistas",
  protocolizacion: "Protocolización",
  division: "División de sociedad",
  "traspaso-acciones": "Traspaso de acciones",
  "inscripcion-comercio": "Inscripción Registro de Comercio",
  "inscripcion-vigente": "Inscripción con vigencia",
  "certificado-vigencia": "Certificado de vigencia",
  "estatuto-actualizado": "Certificado de estatuto actualizado",
  "carpeta-tributaria": "Carpeta tributaria",
  "inicio-actividades": "Inicio de actividades",
  regimen: "Certificado de régimen tributario",
  erut: "e-RUT",
  dicom: "Informe Dicom",
  patente: "Patente municipal",
  arriendo: "Contrato de arriendo",
};

/** Lo que no es documentación legal de la sociedad: va a revisar, no a la carpeta de la sociedad. */
const NO_LEGAL = /whatsapp|cotizacion|propuesta|para completar|supplier|proveedor|\bfactura\b|best case|formulario economico|libro mayor|cartola|fiscalizador|comprobante de (transferencia|pago)|\.zip$|consolidad|estado de resultados|resolucion sanitaria/;

function capitalizarSiGrita(texto: string): string {
  const letras = texto.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  if (letras && letras === letras.toUpperCase() && letras.length > 4) {
    return texto.toLowerCase().replace(/(^|[\s(-])([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase());
  }
  return texto;
}

/**
 * El nombre original sin lo que sobra: la sociedad (ya está en la carpeta), la fecha (va aparte), «Copia»,
 * numeraciones «1.», identificadores, RUT y signos repetidos.
 */
export function limpiarNombre(original: string, sociedad: SociedadBase | null): string {
  let t = sinExtension(original).replace(/\?\?/g, "").replace(/_/g, " ");
  t = t.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, " ");
  t = t.replace(/\b\d{1,2}(\.\d{3}){2}-[\dkK]\b|\b\d{7,8}-[\dkK]\b/g, " ");
  t = t.replace(/\((copia[^)]*|comprimido)\)/gi, " ").replace(/\bcopia( de)?\b/gi, " ");
  t = t.replace(/\s*-?\s*(emitid[oa]|vigente al|otorgad[oa]|generad[oa]|inscrit[oa]|escanead[oa]|pagad[oa])\s+\d{1,2}[-./]\d{1,2}[-./]\d{2,4}/gi, " ");
  t = t.replace(/\s-\s\d{1,2}[-./]\d{1,2}[-./]\d{2,4}\b/g, " ").replace(/\(\d{1,2}\.\d{1,2}\.\d{2}\)/g, " ");
  t = t.replace(/^\s*\d+\.\s*/, "");
  if (sociedad) {
    const nombre = sociedad.nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const clave = claveDeSociedad(sociedad.nombre).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sigla = siglaDeSociedad(sociedad.nombre);
    t = t.replace(new RegExp(nombre, "gi"), " ");
    if (clave) t = t.replace(new RegExp(`\\b${clave.split(" ").join("\\s+")}\\b(\\s+(spa|ltda\\.?|limitada))?`, "gi"), " ");
    if (sigla) t = t.replace(new RegExp(`\\b${sigla}\\b`, "gi"), " ");
  }
  t = t.replace(/\(\s*\)/g, " ").replace(/\s*[.]\s*(?=\s|$)/g, " ").replace(/\s+-\s+(?=-|$)/g, " ").replace(/\s{2,}/g, " ").replace(/^[\s.-]+|[\s.-]+$/g, "");
  t = capitalizarSiGrita(t);
  return cortarEnPalabra(t, 80) || "Documento";
}

/** Corta un texto largo en la última palabra completa (nada de «Marzo 202» o «SAP PERTE»). */
export function cortarEnPalabra(t: string, max: number): string {
  if (t.length <= max) return t.trim();
  const corte = t.slice(0, max + 1).lastIndexOf(" ");
  return t.slice(0, corte > max * 0.6 ? corte : max).replace(/[\s.,(-]+$/, "").trim();
}

/** El nombre profesional de un documento: corto, con su tipo y su fecha. */
export function nombreProfesional(d: Documento, sociedad: SociedadBase | null): string {
  const ext = d.extension || "pdf";
  const [anio, mes, dia] = (d.emision ?? "").split("-").map(Number);
  let titulo: string;
  if (d.tipo === "f29" && d.emision) titulo = `F29 IVA - ${MESES[mes - 1]} ${anio}`;
  else if (d.tipo === "f22" && d.emision && mes === 4 && dia === 30) titulo = `F22 Renta - AT ${anio}`;
  else if (d.tipo === "balance" && d.emision && mes === 12 && dia === 31) titulo = `${/clasificado/i.test(d.nombre) ? "Balance clasificado" : /tributario/i.test(d.nombre) ? "Balance tributario" : "Balance general"} - Ejercicio ${anio}`;
  else {
    let base = TITULO[d.tipo] ?? limpiarNombre(d.nombre, sociedad);
    // Si el nombre limpio ya no dice qué es (el tipo venía de la carpeta), se le antepone el tipo.
    if (d.tipo !== "otro" && reconocerTipo(base).id !== d.tipo) base = `${TIPO_POR_ID[d.tipo]?.nombre ?? "Documento"} - ${base}`;
    titulo = d.emision ? `${base} - Emitido ${formatearFecha(d.emision)}` : base;
    if (d.vence && d.tipo !== "certificado-vigencia" && (d.tipo === "patente" || d.tipo === "arriendo")) titulo += ` - Vence ${formatearFecha(d.vence)}`;
  }
  return `${titulo.replace(/["*:<>?/\\|#%]/g, " ").replace(/\s{2,}/g, " ").trim()}.${ext}`;
}

const NOMBRE_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.nombre]));

function esNoLegal(d: Documento): boolean {
  const n = normalizar(d.ruta);
  return d.restringido || d.tipo === "otro" || NO_LEGAL.test(n);
}

/** La copia que se queda de un grupo de archivos idénticos. */
function elegirOriginal(grupo: Documento[]): Documento {
  return [...grupo].sort((a, b) => {
    const sa = a.area === "sociedades" ? 0 : 1;
    const sb = b.area === "sociedades" ? 0 : 1;
    const ca = /copia/i.test(a.nombre) ? 1 : 0;
    const cb = /copia/i.test(b.nombre) ? 1 : 0;
    return sa - sb || ca - cb || (b.modificado ?? "").localeCompare(a.modificado ?? "") || a.ruta.length - b.ruta.length;
  })[0];
}

const esMalla = (d: Documento) => d.tipo === "malla" || /(^|\/)malla societaria(\/|$)/i.test(d.ruta.replace(/\?\?/g, ""));
const enRaizDeMalla = (d: Documento) => /^malla societaria\//i.test(d.ruta.replace(/\?\?/g, ""));

/**
 * De un grupo de copias idénticas, la que mejor DESCRIBE el documento: la que trae fecha de emisión y
 * un tipo reconocido. Muchas veces la copia de la carpeta de la sociedad se llama «MOD. Inscripcion. IH.pdf»
 * y la que se mandó a un abogado, «Copia Inscripción … Modificación Estatutos - 15-06-2022»: el archivo que se
 * queda es el primero, pero el nombre nuevo sale del segundo.
 */
function mejorDescrito(grupo: Documento[], original: Documento): Documento {
  if (original.emision && original.tipo !== "otro") return original;
  return [...grupo].sort((a, b) => Number(Boolean(b.emision)) - Number(Boolean(a.emision)) || Number(b.tipo !== "otro") - Number(a.tipo !== "otro"))[0] ?? original;
}

/**
 * El plan completo. `docs` es el repositorio tal como lo arma armarDocumentos (con copias y estados), SIN
 * filtrar por persona ni ocultar la malla.
 */
export function planDeOrden(docs: Documento[], sociedades: SociedadBase[], opciones: OpcionesOrden = {}): Operacion[] {
  const porSlug = new Map(sociedades.map((s) => [s.slug, s]));
  const carpetaDe = (s: SociedadBase) => (opciones.carpetas?.[s.slug] || s.nombre).replace(/["*:<>?/\\|#%]/g, " ").replace(/\s{2,}/g, " ").trim();
  const ops: Operacion[] = [];
  const base = (d: Documento): Omit<Operacion, "accion" | "destino" | "nombre" | "motivo"> => ({ id: d.id, rutaActual: d.ruta, sociedad: d.sociedad, tipo: d.tipo, tamano: d.tamano });

  // 1) Copias idénticas: mismo contenido (hash) o, sin hash, mismo nombre limpio y mismo tamaño.
  //    Los archivos vacíos no son copias de nada: se eliminan aparte.
  const vacios = new Set(docs.filter((d) => d.tamano === 0).map((d) => d.id));
  const grupos = new Map<string, Documento[]>();
  for (const d of docs) {
    if (vacios.has(d.id)) continue;
    const k = d.hash ?? `${normalizar(limpiarNombre(d.nombre, null))}|${d.tamano}`;
    grupos.set(k, [...(grupos.get(k) ?? []), d]);
  }
  const eliminadas = new Set<string>();
  const originalDe = new Map<string, Documento>();
  const descripcion = new Map<string, Documento>(); // original → el que mejor lo describe
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    // De la malla se queda la de su carpeta en la raíz.
    const original = grupo.find(enRaizDeMalla) ?? elegirOriginal(grupo);
    descripcion.set(original.id, mejorDescrito(grupo, original));
    for (const d of grupo) {
      if (d.id === original.id) continue;
      eliminadas.add(d.id);
      originalDe.set(d.id, original);
    }
  }

  // 2) Versiones anteriores: el Core ya las marca «historico» (hay otra más nueva del mismo tipo).
  const anteriores = new Set(opciones.eliminarVersionesAnteriores ? docs.filter((d) => d.estado === "historico" && !eliminadas.has(d.id)).map((d) => d.id) : []);

  // Los nombres que YA existen en cada carpeta se reservan antes: así el plan es el mismo si se vuelve a
  // calcular a mitad de camino (lo ya movido queda «mantener» y nadie le pisa el nombre).
  const usados = new Map<string, Set<string>>(); // carpeta → nombres ya tomados
  for (const d of docs) {
    if (eliminadas.has(d.id) || vacios.has(d.id)) continue;
    const c = d.ruta.split("/").slice(0, -1).join("/");
    usados.set(c, (usados.get(c) ?? new Set<string>()).add(normalizar(d.nombre)));
  }
  const reservar = (carpeta: string, nombre: string): string => {
    const tomados = usados.get(carpeta) ?? new Set<string>();
    const punto = nombre.lastIndexOf(".");
    const raiz = punto > 0 ? nombre.slice(0, punto) : nombre;
    const ext = punto > 0 ? nombre.slice(punto) : "";
    let final = nombre;
    for (let i = 2; tomados.has(normalizar(final)); i++) final = `${raiz} (${i})${ext}`;
    tomados.add(normalizar(final));
    usados.set(carpeta, tomados);
    return final;
  };

  for (const d of docs) {
    if (vacios.has(d.id)) {
      ops.push({ ...base(d), accion: "eliminar", destino: null, nombre: null, motivo: "Archivo vacío (0 bytes)" });
      continue;
    }
    if (eliminadas.has(d.id)) {
      ops.push({ ...base(d), accion: "eliminar", destino: null, nombre: null, motivo: `Copia idéntica de «${originalDe.get(d.id)!.ruta}»` });
      continue;
    }
    if (esMalla(d)) {
      if (d.area === "revisar") {
        ops.push({ ...base(d), accion: "mantener", destino: null, nombre: null, motivo: "Ya está en Por revisar" });
        continue;
      }
      ops.push({ ...base(d), accion: enRaizDeMalla(d) ? "mantener" : "revisar", destino: enRaizDeMalla(d) ? null : `${CARPETA_POR_REVISAR}/Sin sociedad`, nombre: enRaizDeMalla(d) ? null : d.nombre, motivo: "Malla societaria: se queda en su carpeta" });
      continue;
    }
    if (anteriores.has(d.id)) {
      ops.push({ ...base(d), accion: "eliminar", destino: null, nombre: null, motivo: "Versión anterior: hay otra más reciente del mismo documento" });
      continue;
    }
    // Lo que describe el documento (tipo, fecha, categoría) puede venir de una de sus copias.
    const info = descripcion.get(d.id) ?? d;
    const sociedadSlug = d.sociedad ?? info.sociedad;
    const sociedad = sociedadSlug ? porSlug.get(sociedadSlug) ?? null : null;
    if (!sociedad || esNoLegal(d)) {
      const carpeta = `${CARPETA_POR_REVISAR}/${sociedad ? carpetaDe(sociedad) : "Sin sociedad"}`;
      if (d.area === "revisar" && d.ruta.startsWith(`${carpeta}/`)) {
        ops.push({ ...base(d), accion: "mantener", destino: null, nombre: null, motivo: "Ya está en Por revisar" });
        continue;
      }
      const nombre = reservar(carpeta, `${limpiarNombre(d.nombre, sociedad)}.${d.extension || "pdf"}`);
      const motivo = d.restringido ? "Contiene claves: no va en el repositorio" : !sociedad ? "No se pudo saber de qué sociedad es" : d.tipo === "otro" ? "No se reconoce qué documento es" : "No es documentación legal de la sociedad";
      ops.push({ ...base(d), sociedad: sociedadSlug, accion: "revisar", destino: carpeta, nombre, motivo });
      continue;
    }
    const descrito: Documento = { ...info, extension: d.extension, nombre: info.nombre };
    const carpeta = `${CARPETA_SOCIEDADES}/${carpetaDe(sociedad)}/${NOMBRE_CATEGORIA[descrito.categoria] ?? "Otros"}`;
    const actualCarpeta = d.ruta.split("/").slice(0, -1).join("/");
    const ideal = nombreProfesional(descrito, sociedad);
    const yaEsta = actualCarpeta === carpeta && (d.nombre === ideal || new RegExp(`^${ideal.replace(/\.[^.]+$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(\\d+\\)\\.`).test(d.nombre));
    const nombre = yaEsta ? d.nombre : reservar(carpeta, ideal);
    if (yaEsta) ops.push({ ...base(d), accion: "mantener", destino: null, nombre: null, motivo: "Ya está ordenado" });
    else ops.push({ ...base(d), sociedad: sociedadSlug, tipo: descrito.tipo, accion: "mover", destino: carpeta, nombre, motivo: d.area === "solicitudes" ? "Documento único de una solicitud: pasa a su sociedad" : "A su sociedad y categoría, con nombre corto" });
  }
  return ops;
}

export interface ResumenPlan {
  mover: number;
  revisar: number;
  eliminar: number;
  mantener: number;
  bytesLiberados: number;
}

export function resumirPlan(ops: Operacion[]): ResumenPlan {
  return {
    mover: ops.filter((o) => o.accion === "mover").length,
    revisar: ops.filter((o) => o.accion === "revisar").length,
    eliminar: ops.filter((o) => o.accion === "eliminar").length,
    mantener: ops.filter((o) => o.accion === "mantener").length,
    bytesLiberados: ops.filter((o) => o.accion === "eliminar").reduce((s, o) => s + o.tamano, 0),
  };
}
