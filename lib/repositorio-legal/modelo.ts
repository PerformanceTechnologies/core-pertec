// -----------------------------------------------------------------------------
//  Repositorio Legal: las reglas puras (sin base, sin Graph). Las importan las pantallas, el
//  servidor y scripts/probar-repositorio-legal.mts, así que dicen lo mismo en los tres lados.
//
//  La base de datos es SharePoint: «ARCHIVOS CORE/ANTECEDENTES LEGALES». Nada de lo que se ve acá
//  se guarda en Supabase. La sociedad sale de la CARPETA (SOCIEDADES/<carpeta de la sociedad>), y el
//  tipo, la fecha de emisión y el vencimiento salen del NOMBRE del archivo. Por eso al subir desde el
//  Core el nombre se arma con una convención fija («<Tipo> - Emitido dd-mm-aaaa[ - Vence dd-mm-aaaa]»):
//  así el dato vive en SharePoint mismo y se ve igual desde la biblioteca que desde el Core.
//
//  El repo es público: acá no va ningún nombre, RUT ni porcentaje de las sociedades. Todo eso se lee
//  de SharePoint en tiempo de ejecución.
// -----------------------------------------------------------------------------

export const SLUG_REPOSITORIO_LEGAL = "repositorio-legal";
export const RUTA_REPOSITORIO_LEGAL = "/repositorio-legal";

/** Días antes del vencimiento en que un documento pasa a «por vencer». */
export const DIAS_AVISO_LEGAL = 30;
/** Los hitos en que se manda un aviso al Buzón (días que faltan; 0 = venció). */
export const HITOS_DE_AVISO = [30, 7, 0] as const;

// ---------- Categorías y tipos ---------------------------------------------------

export type Categoria = "constitucion" | "inscripciones" | "tributario" | "financieros" | "poderes" | "contratos" | "laboral" | "grupo" | "otros";

export const CATEGORIAS: { id: Categoria; nombre: string; corto: string }[] = [
  { id: "constitucion", nombre: "Constitución y estatutos", corto: "Constitución" },
  { id: "inscripciones", nombre: "Inscripciones y vigencias", corto: "Vigencias" },
  { id: "tributario", nombre: "SII y tributario", corto: "Tributario" },
  { id: "financieros", nombre: "Estados financieros y bancos", corto: "Financieros" },
  { id: "poderes", nombre: "Poderes y representantes", corto: "Poderes" },
  { id: "contratos", nombre: "Contratos y propiedades", corto: "Contratos" },
  { id: "laboral", nombre: "Laboral y litigios", corto: "Laboral" },
  { id: "grupo", nombre: "Grupo y malla societaria", corto: "Grupo" },
  { id: "otros", nombre: "Otros", corto: "Otros" },
];

export const NOMBRE_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.nombre])) as Record<Categoria, string>;

/**
 * Cuánto dura un documento.
 *  · no_vence:  escrituras, estatutos, e-RUT… valen siempre.
 *  · dias:      vale N días desde su emisión (los certificados que piden «con menos de X días»).
 *  · explicita: trae su propia fecha de vencimiento (patente, arriendo): va en el nombre, «Vence dd-mm-aaaa».
 */
export type Regla = { modo: "no_vence" } | { modo: "dias"; dias: number } | { modo: "explicita" };

export interface TipoDocumento {
  id: string;
  nombre: string;
  categoria: Categoria;
  regla: Regla;
  /** Se reconoce por el nombre del archivo (sin tildes, en minúsculas). El primero que calza gana. */
  patron: RegExp;
  /** Solo lo ve quien tiene permiso de confidenciales. */
  confidencial?: boolean;
  /** Solo el administrador del Core (claves, contraseñas). */
  restringido?: boolean;
}

const NO_VENCE: Regla = { modo: "no_vence" };
const dias = (n: number): Regla => ({ modo: "dias", dias: n });
const EXPLICITA: Regla = { modo: "explicita" };

/**
 * El catálogo. El ORDEN importa: lo específico va antes que lo general («Escritura Saneamiento
 * Constitución» es saneamiento, no constitución; «Copia Inscripción … Vigente al» es una vigencia).
 */
export const TIPOS: TipoDocumento[] = [
  { id: "claves", nombre: "Claves de acceso", categoria: "otros", regla: NO_VENCE, patron: /\bclaves?\b|contrasen/, restringido: true },
  { id: "malla", nombre: "Malla societaria", categoria: "grupo", regla: NO_VENCE, patron: /malla|organigrama/ },
  // Laboral (confidencial): antes que «contrato», para que un contrato de trabajo no caiga en Contratos.
  { id: "laboral", nombre: "Documento laboral", categoria: "laboral", regla: NO_VENCE, patron: /contrato de trabajo|despido|finiquito|liquidacion(es)? de remuneraci|\bodi\b|obligacion de informar|anexo contrato de trabajo|demanda/, confidencial: true },
  { id: "cedula", nombre: "Cédula de identidad", categoria: "poderes", regla: NO_VENCE, patron: /cedula|carnet|_tmp_cedula/, confidencial: true },
  // Vigencias: certificados que se piden recientes.
  { id: "certificado-vigencia", nombre: "Certificado de vigencia", categoria: "inscripciones", regla: dias(60), patron: /vigencia (de )?soc|certificado de vigencia|no disolucion|vigencia sociedad|soceidad/ },
  { id: "inscripcion-vigente", nombre: "Inscripción con vigencia", categoria: "inscripciones", regla: dias(60), patron: /inscripcion.*(vigente al|con vigencia|timbre de vigencia)|inscripcion vigencia|anotaciones al margen/ },
  { id: "estatuto-actualizado", nombre: "Certificado de estatuto actualizado", categoria: "inscripciones", regla: dias(60), patron: /estatuto actualizado/ },
  // Constitución y estatutos.
  { id: "saneamiento", nombre: "Escritura de saneamiento", categoria: "constitucion", regla: NO_VENCE, patron: /saneamiento/ },
  { id: "modificacion-estatutos", nombre: "Modificación de estatutos", categoria: "constitucion", regla: NO_VENCE, patron: /modificacion (de )?estatut|mod\.? (estatut|inscripcion|publicacion)|modificaciondeestatutos/ },
  { id: "extracto-do", nombre: "Publicación en Diario Oficial", categoria: "constitucion", regla: NO_VENCE, patron: /diario oficial|publicacion|extracto|\bdo\b/ },
  { id: "acta-junta", nombre: "Acta de junta de accionistas", categoria: "constitucion", regla: NO_VENCE, patron: /acta|junta/ },
  { id: "protocolizacion", nombre: "Protocolización", categoria: "constitucion", regla: NO_VENCE, patron: /protocoliz/ },
  { id: "division", nombre: "División de sociedad", categoria: "constitucion", regla: NO_VENCE, patron: /division/ },
  { id: "traspaso-acciones", nombre: "Traspaso de acciones", categoria: "constitucion", regla: NO_VENCE, patron: /traspaso/ },
  { id: "inscripcion-comercio", nombre: "Inscripción Registro de Comercio", categoria: "inscripciones", regla: NO_VENCE, patron: /registro de comercio|inscripcion|\bcbr\b/ },
  { id: "constitucion", nombre: "Escritura de constitución / estatutos", categoria: "constitucion", regla: NO_VENCE, patron: /constitucion|estatut|escritura/ },
  // SII y tributario.
  { id: "carpeta-tributaria", nombre: "Carpeta tributaria", categoria: "tributario", regla: dias(90), patron: /carpeta.?tributaria/ },
  { id: "f29", nombre: "Formulario 29 (IVA)", categoria: "tributario", regla: dias(60), patron: /formulario 29|\bf29\b/ },
  { id: "f22", nombre: "Formulario 22 (Renta)", categoria: "tributario", regla: dias(400), patron: /formulario 22|\bf22\b|declaracion de renta|renta at/ },
  { id: "inicio-actividades", nombre: "Inicio de actividades", categoria: "tributario", regla: NO_VENCE, patron: /inicio( de)? ?actividades/ },
  { id: "regimen", nombre: "Régimen tributario", categoria: "tributario", regla: NO_VENCE, patron: /regimen|pro pyme/ },
  { id: "erut", nombre: "e-RUT / Certificado RUT", categoria: "tributario", regla: NO_VENCE, patron: /e-?rut|rol unico|\brut\b|^\d{7,8}-[\dk]/ },
  { id: "poder", nombre: "Poder", categoria: "poderes", regla: NO_VENCE, patron: /poder/ },
  { id: "certificado-sii", nombre: "Certificado o aviso SII", categoria: "tributario", regla: NO_VENCE, patron: /\bsii\b|cambio de giro|verificacion de actividades|aviso/ },
  // Financieros y bancos.
  { id: "dicom", nombre: "Informe Dicom", categoria: "financieros", regla: dias(30), patron: /dicom/ },
  { id: "balance", nombre: "Balance / estados financieros", categoria: "financieros", regla: dias(480), patron: /balance|estado de resultados|ee\.?ff|antecedentes financieros/ },
  { id: "banco", nombre: "Certificado bancario", categoria: "financieros", regla: dias(90), patron: /cuenta (corriente|bancaria)|cta bancaria|cartola|libro mayor|linea credito|vigencia_cuenta/ },
  // Contratos y propiedades.
  { id: "patente", nombre: "Patente municipal", categoria: "contratos", regla: EXPLICITA, patron: /patente/ },
  { id: "arriendo", nombre: "Contrato de arriendo", categoria: "contratos", regla: EXPLICITA, patron: /arriendo/ },
  { id: "propiedad", nombre: "Antecedente de propiedad", categoria: "contratos", regla: NO_VENCE, patron: /propiedad|inmueble|dominio|avaluo|contribuciones|serviu|titulos|compraventa|prenda|afectacion|seremi|zonificacion|croquis|aguas|ruido/ },
  { id: "contrato", nombre: "Contrato o acuerdo", categoria: "contratos", regla: NO_VENCE, patron: /contrato|acuerdo|carta|cotizacion|propuesta/ },
];

export const OTRO: TipoDocumento = { id: "otro", nombre: "Otro documento", categoria: "otros", regla: NO_VENCE, patron: /$^/ };

export const TIPO_POR_ID: Record<string, TipoDocumento> = Object.fromEntries([...TIPOS, OTRO].map((t) => [t.id, t]));

/**
 * Lo que toda sociedad debería tener. Si falta, o el último está vencido, la sociedad lo muestra.
 */
export const DOCUMENTOS_CLAVE: string[] = ["constitucion", "extracto-do", "inscripcion-comercio", "certificado-vigencia", "erut", "inicio-actividades"];

// ---------- Texto ---------------------------------------------------------------

/** Minúsculas, sin tildes, espacios simples (para comparar y reconocer). */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Los nombres que vienen de un zip de Mac traen la tilde como «??»: se borra igual.
    .replace(/\?\?/g, "")
    .toLowerCase()
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sinExtension(nombre: string): string {
  const p = nombre.lastIndexOf(".");
  return p > 0 ? nombre.slice(0, p) : nombre;
}

export function extension(nombre: string): string {
  const p = nombre.lastIndexOf(".");
  return p > 0 ? nombre.slice(p + 1).toLowerCase() : "";
}

/** El tipo de un documento a partir de su nombre (y, si no alcanza, de su carpeta). */
export function reconocerTipo(nombre: string, carpeta = ""): TipoDocumento {
  const n = normalizar(sinExtension(nombre));
  for (const t of TIPOS) if (t.patron.test(n)) return t;
  const c = normalizar(carpeta);
  for (const t of TIPOS) if (t.patron.test(c)) return t;
  return OTRO;
}

// ---------- Fechas --------------------------------------------------------------

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function iso(a: number, m: number, d: number): string | null {
  if (a < 100) a += 2000;
  if (a < 1990 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCMonth() !== m - 1) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function ultimoDiaDelMes(a: number, m: number): string {
  const d = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return iso(a, m, d)!;
}

/** «dd-mm-aaaa», «d.m.aa», «ddmmaaaa» → aaaa-mm-dd. */
function leerFecha(texto: string): string | null {
  // ISO primero (aaaa-mm-dd, como en «Imagen de WhatsApp 2025-10-08»): si no, «25-10-08» se leería como 2008.
  let m = texto.match(/(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = texto.match(/(?<!\d)(\d{1,2})[-./](\d{1,2})[-./](\d{4}|\d{2})(?!\d)/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = texto.match(/\b(\d{2})(\d{2})(20\d{2})\b/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  return null;
}

export interface FechasDelNombre {
  emision: string | null;
  vence: string | null;
}

/**
 * La fecha de emisión (y el vencimiento, si lo trae) leídos del nombre del archivo.
 *
 * Los nombres de la carpeta ya vienen ordenados: «Emitido 26-09-2024», «Vigente al 19-05-2025»,
 * «Otorgada 05-07-2022», «Generada 28-08-2025», «Ejercicio Comercial 2024», «Año Tributario 2025»,
 * «Agosto 2025», «vence julio 2025». Lo que no se pueda leer queda en null y la pantalla lo marca
 * «Sin fecha de emisión» para completarlo.
 */
export function fechasDelNombre(nombre: string): FechasDelNombre {
  const n = normalizar(sinExtension(nombre));
  let vence: string | null = null;
  let resto = n;

  // «Vence dd-mm-aaaa» o «vence julio 2025».
  const v = n.match(/vence(?:n)?\s+(?:el\s+)?(\d{1,2}[-./]\d{1,2}[-./]\d{2,4}|[a-z]+\s+(?:de\s+)?\d{4})/);
  if (v) {
    vence = leerFecha(v[1]);
    if (!vence) {
      const mm = v[1].match(/([a-z]+)\s+(?:de\s+)?(\d{4})/);
      if (mm && MESES[mm[1]]) vence = ultimoDiaDelMes(+mm[2], MESES[mm[1]]);
    }
    resto = n.replace(v[0], " ");
  }

  // Una fecha precedida de una palabra de emisión manda sobre cualquier otra.
  const conClave = resto.match(/(?:emitid[oa]|vigente al|otorgad[oa]|generad[oa]|inscrit[oa]|escanead[oa]|pagad[oa]|al|del?)\s+(\d{1,2}[-./]\d{1,2}[-./]\d{2,4})/);
  let emision = conClave ? leerFecha(conClave[1]) : null;
  if (!emision) emision = leerFecha(resto);

  if (!emision) {
    // «Ejercicio (Comercial) 2024» → el balance cierra el 31-12 de ese año.
    const ej = resto.match(/ejercicio(?: comercial)?\s+(20\d{2})/);
    // «Año Tributario 2025» / «AT.2025» → se declara en abril de ese año.
    const at = resto.match(/(?:ano tributario|\bat)\.?\s*(20\d{2})/);
    // «Agosto 2025» (un F29) → el último día de ese mes.
    const mes = resto.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(20\d{2})\b/);
    if (ej) emision = iso(+ej[1], 12, 31);
    else if (at) emision = iso(+at[1], 4, 30);
    else if (mes) emision = ultimoDiaDelMes(+mes[2], MESES[mes[1]]);
  }
  return { emision, vence };
}

export function formatearFecha(isoFecha: string | null): string {
  if (!isoFecha) return "—";
  const [a, m, d] = isoFecha.split("-");
  return `${d}-${m}-${a}`;
}

/** Días desde hoy hasta la fecha (negativo si ya pasó). */
export function diasHasta(fecha: string | null, hoy: Date = new Date()): number | null {
  if (!fecha) return null;
  const f = Date.parse(fecha + "T00:00:00Z");
  const base = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((f - base) / 86_400_000);
}

export function sumarDias(fecha: string, n: number): string {
  const f = new Date(Date.parse(fecha + "T00:00:00Z") + n * 86_400_000);
  return f.toISOString().slice(0, 10);
}

/** «hace 8 meses», «hace 12 días», «hoy». */
export function antiguedad(fecha: string | null, hoy: Date = new Date()): string {
  const d = diasHasta(fecha, hoy);
  if (d === null) return "";
  const pasados = -d;
  if (pasados <= 0) return pasados === 0 ? "hoy" : "fecha futura";
  if (pasados < 31) return `hace ${pasados} ${pasados === 1 ? "día" : "días"}`;
  const meses = Math.floor(pasados / 30.44);
  if (meses < 12) return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
  const anios = Math.floor(meses / 12);
  return `hace ${anios} ${anios === 1 ? "año" : "años"}`;
}

// ---------- Vigencia ------------------------------------------------------------

export type Estado = "vencido" | "por_vencer" | "vigente" | "no_vence" | "sin_fecha" | "historico";

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  vencido: "Vencido",
  por_vencer: "Por vencer",
  vigente: "Vigente",
  no_vence: "No vence",
  sin_fecha: "Sin fecha de emisión",
  historico: "Reemplazado",
};

/** Orden para listar: lo que pide atención primero. */
export const PESO_ESTADO: Record<Estado, number> = { vencido: 0, por_vencer: 1, sin_fecha: 2, vigente: 3, no_vence: 4, historico: 5 };

/** La fecha en que vence, según su tipo. null si no vence o si falta el dato para calcularla. */
export function calcularVencimiento(tipo: TipoDocumento, emision: string | null, venceExplicito: string | null): string | null {
  if (venceExplicito) return venceExplicito;
  if (tipo.regla.modo === "dias" && emision) return sumarDias(emision, tipo.regla.dias);
  return null;
}

export function calcularEstado(tipo: TipoDocumento, emision: string | null, vence: string | null, hoy: Date = new Date()): Estado {
  if (vence) {
    const d = diasHasta(vence, hoy)!;
    if (d < 0) return "vencido";
    return d <= DIAS_AVISO_LEGAL ? "por_vencer" : "vigente";
  }
  if (tipo.regla.modo === "no_vence") return emision || tipo.id === "otro" ? "no_vence" : "sin_fecha";
  return "sin_fecha";
}

export function describirRegla(regla: Regla): string {
  if (regla.modo === "no_vence") return "No vence";
  if (regla.modo === "dias") return `Vale ${regla.dias} días desde su emisión`;
  return "Vence en la fecha que indica";
}

// ---------- Ubicación en SharePoint ---------------------------------------------

/** Las carpetas de primer nivel que son paquetes enviados a terceros, no documentos de una sociedad. */
export function esCarpetaDeSolicitudes(primerNivel: string): boolean {
  return /solicitud|pedido/i.test(normalizar(primerNivel));
}

/** La carpeta de primer nivel con lo que hay que revisar (no es documentación legal, o no se sabe de quién es). */
export function esCarpetaDePorRevisar(primerNivel: string): boolean {
  return /^por revisar$/.test(normalizar(primerNivel));
}
export const esCarpetaPorRevisar = esCarpetaDePorRevisar;

/** La carpeta de primer nivel donde viven las sociedades. */
export function esCarpetaDeSociedades(primerNivel: string): boolean {
  return /^sociedades?$/.test(normalizar(primerNivel));
}

/** «Legales VULCAMIN SPA» → «Vulcamin SpA»; «CONSTITUCION MINETCO» → «Minetco». */
export function nombreDeSociedad(carpeta: string): string {
  const base = carpeta
    .replace(/\?\?/g, "")
    .replace(/^\s*(legales|constitucion|constitución|documentos)\s+/i, "")
    .trim();
  return base
    .toLowerCase()
    .split(/\s+/)
    .map((p) => (p === "spa" ? "SpA" : p === "ltda" || p === "ltda." ? "Ltda." : p === "limitada" ? "Limitada" : /^(de|del|y|la|las|los)$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** El slug de URL de una sociedad (estable mientras no se renombre su carpeta). */
export function slugDe(texto: string): string {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Palabras que distinguen a una sociedad dentro de una ruta o nombre («innovation health», «vulcamin»). */
export function claveDeSociedad(nombre: string): string {
  return normalizar(nombre)
    .replace(/\b(spa|ltda\.?|limitada|s\.a\.?|sociedad|por acciones)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SociedadBase {
  slug: string;
  nombre: string;
  /** El nombre de su carpeta bajo SOCIEDADES. */
  carpeta: string;
}

/**
 * A qué sociedad pertenece un archivo que NO está bajo SOCIEDADES (una solicitud, Propiedad MDR…):
 * la primera sociedad cuyo nombre aparece en su ruta o en su nombre. null si no se puede saber.
 */
export function sociedadPorTexto(texto: string, sociedades: SociedadBase[]): SociedadBase | null {
  const t = ` ${normalizar(texto).replace(/[^a-z0-9 ]/g, " ")} `;
  // La clave más larga primero: «innova estate» antes que «innova».
  const orden = [...sociedades].sort((a, b) => claveDeSociedad(b.nombre).length - claveDeSociedad(a.nombre).length);
  for (const s of orden) {
    const k = claveDeSociedad(s.nombre);
    if (k && t.includes(` ${k} `)) return s;
  }
  // La sigla, como palabra suelta: «Estatutos IH», «Vigencia Sociedad CC CBRS PT».
  for (const s of orden) {
    const sigla = siglaDeSociedad(s.nombre);
    if (sigla && t.includes(` ${sigla} `)) return s;
  }
  return null;
}

/** «Innovation Health SpA» → «ih». Solo con dos palabras o más (una sigla de una letra no distingue). */
export function siglaDeSociedad(nombre: string): string | null {
  const palabras = claveDeSociedad(nombre).split(" ").filter((p) => p && !/^(de|del|y|la|los|las)$/.test(p));
  return palabras.length >= 2 ? palabras.map((p) => p[0]).join("") : null;
}

// ---------- Documentos ----------------------------------------------------------

/** Un archivo de SharePoint tal como lo entrega Graph (solo lo que se usa). */
export interface ArchivoCrudo {
  id: string;
  nombre: string;
  /** Ruta relativa a la raíz del repositorio, con el nombre: «SOCIEDADES/Legales X/Estatutos/a.pdf». */
  ruta: string;
  tamano: number;
  modificado: string;
  modificadoPor: string | null;
  webUrl: string | null;
  hash: string | null;
}

export interface Documento extends ArchivoCrudo {
  carpeta: string;
  area: "sociedades" | "solicitudes" | "revisar" | "otros";
  /** El paquete al que pertenece (solo en solicitudes): «BANCOCHILE», «IST»… */
  paquete: string | null;
  sociedad: string | null;
  tipo: string;
  tipoNombre: string;
  categoria: Categoria;
  emision: string | null;
  vence: string | null;
  estado: Estado;
  extension: string;
  confidencial: boolean;
  restringido: boolean;
  /** Otro archivo idéntico (mismo contenido) ya aparece antes: es una copia. */
  copiaDe: string | null;
}

/** Las sociedades: una por cada subcarpeta de SOCIEDADES. */
export function sociedadesDe(carpetasDeSociedades: string[]): SociedadBase[] {
  const vistas = new Map<string, SociedadBase>();
  for (const carpeta of carpetasDeSociedades) {
    const nombre = nombreDeSociedad(carpeta);
    const slug = slugDe(nombre);
    if (slug && !vistas.has(slug)) vistas.set(slug, { slug, nombre, carpeta });
  }
  return [...vistas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * Convierte los archivos crudos en documentos: sociedad, tipo, fechas, estado y copias.
 *
 * Dos reglas que evitan ruido:
 *  · COPIAS: el mismo archivo (mismo hash de contenido) aparece varias veces porque se copió a
 *    cada solicitud. Se muestra una vez; las demás quedan marcadas como copia.
 *  · HISTÓRICOS: si una sociedad tiene varios certificados de vigencia, solo el más reciente cuenta
 *    para las alertas; los anteriores pasan a «Reemplazado». Un certificado de 2022 no está
 *    «vencido»: ya hay otro más nuevo.
 */
export function armarDocumentos(
  archivos: ArchivoCrudo[],
  sociedades: SociedadBase[],
  hoy: Date = new Date(),
  /** Slug de la sociedad a la que se asignan las solicitudes y antecedentes que no dicen de quién son. */
  porOmision: string | null = null,
): Documento[] {
  const omision = porOmision ? sociedades.find((s) => s.slug === porOmision) ?? null : null;
  const porCarpeta = new Map(sociedades.map((s) => [normalizar(s.carpeta), s]));
  // Primero lo que está en SOCIEDADES: así el «original» de una copia es el de la sociedad.
  const ordenados = [...archivos].sort((a, b) => {
    const pa = esCarpetaDeSociedades(a.ruta.split("/")[0]) ? 0 : 1;
    const pb = esCarpetaDeSociedades(b.ruta.split("/")[0]) ? 0 : 1;
    return pa - pb || a.ruta.localeCompare(b.ruta);
  });

  const vistosPorHash = new Map<string, string>();
  const docs: Documento[] = ordenados
    .filter((a) => !/^\.ds_store$|^thumbs\.db$|^~\$/i.test(a.nombre))
    .map((a) => {
      const partes = a.ruta.split("/");
      const primer = partes[0] ?? "";
      const carpeta = partes.slice(0, -1).join("/");
      const area: Documento["area"] = esCarpetaDeSociedades(primer) ? "sociedades" : esCarpetaDeSolicitudes(primer) ? "solicitudes" : esCarpetaPorRevisar(primer) ? "revisar" : "otros";
      let sociedad: SociedadBase | null = null;
      if (area === "sociedades" && partes.length > 2) sociedad = porCarpeta.get(normalizar(partes[1])) ?? null;
      if (!sociedad) {
        // Una subcarpeta «Legales X» dentro de una solicitud también dice de quién es.
        for (const p of partes.slice(0, -1)) {
          const s = porCarpeta.get(normalizar(p));
          if (s) {
            sociedad = s;
            break;
          }
        }
      }
      if (!sociedad) sociedad = sociedadPorTexto(a.ruta, sociedades);
      if (!sociedad && area !== "sociedades" && !/malla/i.test(primer)) sociedad = omision;

      const tipo = reconocerTipo(a.nombre, carpeta);
      const { emision, vence: venceExplicito } = fechasDelNombre(a.nombre);
      const vence = calcularVencimiento(tipo, emision, venceExplicito);
      // La subcarpeta de la sociedad dice la categoría («SOCIEDADES/X/SII y tributario/…»): así un archivo que
      // alguien movió a mano en SharePoint queda donde lo dejó.
      const deCarpeta = area === "sociedades" && partes.length > 3 ? CATEGORIAS.find((c) => normalizar(c.nombre) === normalizar(partes[2]))?.id : undefined;
      const categoria: Categoria = /malla/i.test(primer) ? "grupo" : deCarpeta ?? tipo.categoria;

      let copiaDe: string | null = null;
      if (a.hash) {
        const previo = vistosPorHash.get(a.hash);
        if (previo) copiaDe = previo;
        else vistosPorHash.set(a.hash, a.id);
      }

      return {
        ...a,
        carpeta,
        area,
        paquete: area === "solicitudes" ? (partes.length > 2 ? partes[1] : primer) : null,
        sociedad: sociedad?.slug ?? null,
        tipo: tipo.id,
        tipoNombre: tipo.nombre,
        categoria,
        emision,
        vence,
        estado: calcularEstado(tipo, emision, vence, hoy),
        extension: extension(a.nombre),
        confidencial: Boolean(tipo.confidencial) || /demanda/i.test(a.ruta),
        restringido: Boolean(tipo.restringido),
        copiaDe,
      } satisfies Documento;
    });

  // Históricos: por sociedad y tipo que vence, solo el de emisión más reciente (y que no sea copia).
  const ultimo = new Map<string, Documento>();
  for (const d of docs) {
    if (d.copiaDe || !d.sociedad || !d.emision) continue;
    if (d.estado !== "vencido" && d.estado !== "por_vencer" && d.estado !== "vigente") continue;
    const k = `${d.sociedad}|${d.tipo}`;
    const actual = ultimo.get(k);
    if (!actual || (actual.emision ?? "") < d.emision) ultimo.set(k, d);
  }
  for (const d of docs) {
    if (!d.sociedad || !d.emision || d.copiaDe) continue;
    if (d.estado !== "vencido" && d.estado !== "por_vencer" && d.estado !== "vigente") continue;
    const u = ultimo.get(`${d.sociedad}|${d.tipo}`);
    if (u && u.id !== d.id) d.estado = "historico";
  }
  return docs;
}

/**
 * Lo que el Core NO muestra: la malla societaria (carpeta «Malla Societaria» y sus copias). Sigue en
 * SharePoint; simplemente no es parte del repositorio que se consulta desde el Core.
 */
export function ocultoEnElCore(d: Pick<Documento, "tipo" | "ruta">): boolean {
  return d.tipo === "malla" || /(^|\/)malla societaria(\/|$)/i.test(d.ruta.replace(/\?\?/g, ""));
}

/** Lo que cuenta en las cifras y alertas: sin copias y con sociedad (lo demás no tiene a quién avisarle). */
export function cuentaParaCifras(d: Pick<Documento, "copiaDe" | "sociedad" | "area">): boolean {
  return !d.copiaDe && Boolean(d.sociedad) && d.area !== "revisar";
}

export interface Cifras {
  documentos: number;
  vencidos: number;
  porVencer: number;
  sinFecha: number;
}

/**
 * Las cifras de arriba, con la MISMA regla que la lista de alertas: sin copias, con sociedad y sin
 * los reemplazados. Antes «Vencidos» contaba también los F29 viejos de una solicitud sin sociedad, y
 * el número no calzaba con la lista que tenía justo debajo.
 */
export function cifrasDe(docs: Documento[]): Cifras {
  const base = docs.filter(cuentaParaCifras);
  return {
    documentos: base.length,
    vencidos: base.filter((d) => d.estado === "vencido").length,
    porVencer: base.filter((d) => d.estado === "por_vencer").length,
    sinFecha: base.filter((d) => d.estado === "sin_fecha").length,
  };
}

/** Los documentos que necesitan atención (vencidos, por vencer, sin fecha), sin copias. */
export function requierenAtencion(docs: Documento[]): Documento[] {
  return docs
    .filter((d) => cuentaParaCifras(d) && (d.estado === "vencido" || d.estado === "por_vencer"))
    .sort((a, b) => PESO_ESTADO[a.estado] - PESO_ESTADO[b.estado] || (a.vence ?? "").localeCompare(b.vence ?? ""));
}

export type EstadoClave = "ok" | "por_vencer" | "vencido" | "falta";

export interface DocumentoClave {
  tipo: TipoDocumento;
  estado: EstadoClave;
  documento: Documento | null;
}

/** Los documentos clave de una sociedad: cuál está, cuál falta y cuál venció. */
export function documentosClave(docs: Documento[], sociedad: string): DocumentoClave[] {
  const propios = docs.filter((d) => d.sociedad === sociedad && !d.copiaDe && d.area !== "revisar");
  return DOCUMENTOS_CLAVE.map((id) => {
    const tipo = TIPO_POR_ID[id];
    // Inscripción: sirve tanto la simple como la que trae vigencia.
    const ids = id === "inscripcion-comercio" ? [id, "inscripcion-vigente"] : id === "certificado-vigencia" ? [id, "inscripcion-vigente"] : [id];
    const candidatos = propios
      .filter((d) => ids.includes(d.tipo) && d.estado !== "historico")
      .sort((a, b) => (b.emision ?? "").localeCompare(a.emision ?? ""));
    const doc = candidatos.find((d) => d.estado === "vigente" || d.estado === "no_vence") ?? candidatos[0] ?? null;
    let estado: EstadoClave = "falta";
    if (doc) estado = doc.estado === "vencido" ? "vencido" : doc.estado === "por_vencer" ? "por_vencer" : "ok";
    return { tipo, estado, documento: doc };
  });
}

export interface ResumenSociedad {
  documentos: number;
  vencidos: number;
  porVencer: number;
  sinFecha: number;
  faltantes: number;
  ultimaEmision: string | null;
}

export function resumirSociedad(docs: Documento[], sociedad: string): ResumenSociedad {
  const propios = docs.filter((d) => d.sociedad === sociedad && !d.copiaDe && d.area !== "revisar");
  const clave = documentosClave(docs, sociedad);
  return {
    documentos: propios.length,
    vencidos: propios.filter((d) => d.estado === "vencido").length,
    porVencer: propios.filter((d) => d.estado === "por_vencer").length,
    sinFecha: propios.filter((d) => d.estado === "sin_fecha").length,
    faltantes: clave.filter((c) => c.estado === "falta").length,
    ultimaEmision: propios.reduce<string | null>((m, d) => (d.emision && (!m || d.emision > m) ? d.emision : m), null),
  };
}

// ---------- Nombre al subir -----------------------------------------------------

/**
 * El nombre con que se guarda en SharePoint lo que se sube desde el Core. La fecha de emisión va
 * SIEMPRE: es el dato del que cuelga la vigencia, y en el nombre se ve igual desde SharePoint.
 */
export function nombreAlSubir(opciones: { titulo: string; emision: string; vence?: string | null; extension: string }): string {
  const titulo = opciones.titulo.replace(/["*:<>?/\\|#%\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Documento";
  const partes = [titulo, `Emitido ${formatearFecha(opciones.emision)}`];
  if (opciones.vence) partes.push(`Vence ${formatearFecha(opciones.vence)}`);
  const ext = opciones.extension.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "pdf";
  return `${partes.join(" - ")}.${ext}`;
}

/** Quita del nombre la fecha de emisión y de vencimiento, para proponerlo como título al reemplazar. */
export function tituloSinFechas(nombre: string): string {
  return sinExtension(nombre)
    .replace(/\s*-\s*(emitid[oa]|vigente al|otorgad[oa]|generad[oa]|vence)\s+\d{1,2}[-./]\d{1,2}[-./]\d{2,4}/gi, "")
    .replace(/\s*\((copia[^)]*)\)/gi, "")
    .trim();
}

// ---------- Permisos ------------------------------------------------------------

export type RolRepositorio = "visualizador" | "usuario" | "especial" | "admin";

export const ROLES_REPOSITORIO: { valor: RolRepositorio; etiqueta: string }[] = [
  { valor: "visualizador", etiqueta: "Visualizador" },
  { valor: "usuario", etiqueta: "Usuario normal" },
  { valor: "especial", etiqueta: "Usuario especial" },
  { valor: "admin", etiqueta: "Administrador" },
];

export type AccionRepositorio = "ver" | "subir" | "editar" | "confidencial";

const ACCIONES: Record<RolRepositorio, AccionRepositorio[]> = {
  visualizador: ["ver"],
  usuario: ["ver", "subir"],
  especial: ["ver", "subir", "editar"],
  admin: ["ver", "subir", "editar", "confidencial"],
};

export function esRolRepositorio(v: unknown): v is RolRepositorio {
  return v === "visualizador" || v === "usuario" || v === "especial" || v === "admin";
}

/** El administrador del Core puede todo; el resto, lo que diga su rol en el módulo. */
export function puedeEnRepositorio(rolCore: string, rol: RolRepositorio, accion: AccionRepositorio): boolean {
  if (rolCore === "admin") return true;
  return ACCIONES[rol]?.includes(accion) ?? false;
}

/** Si alguien con estos permisos ve este documento. Lo restringido (claves) es solo del admin del Core. */
export function puedeVerDocumento(d: Pick<Documento, "confidencial" | "restringido">, rolCore: string, rol: RolRepositorio): boolean {
  if (d.restringido) return rolCore === "admin";
  if (d.confidencial) return puedeEnRepositorio(rolCore, rol, "confidencial");
  return true;
}
