// Contactos de Finanzas: reglas puras (sin base de datos). Sin "server-only": las usan el
// formulario (para avisar mientras se escribe), las páginas y el servidor.
//
// Un contacto es el «Receptor» de una factura electrónica. Lo que exige el SII para la factura
// afecta (33) y exenta (34) —formato DTE v2.5, feb-2026, área Receptor— es:
//
//   RUTRecep     RUT con guion y dígito verificador             obligatorio
//   RznSocRecep  nombre o razón social, hasta 100               obligatorio
//   GiroRecep    glosa del giro, hasta 40                       obligatorio
//   DirRecep     dirección legal registrada en el SII, hasta 70 obligatorio
//   CmnaRecep    comuna, hasta 20                               obligatorio
//   CiudadRecep  ciudad, hasta 20                               opcional
//   Contacto     nombre y teléfono del «Atención A:», hasta 80  opcional
//   CorreoRecep  correo del «Atención A:», hasta 80             opcional
//
// En las notas de crédito y débito el giro, la dirección y la comuna son opcionales, pero un
// cliente al que no se le puede emitir factura no está listo, así que se piden igual.
//
// Fuera del XML: el correo de intercambio DTE (adonde se manda el XML al receptor), el tipo de
// contribuyente (si se le emite factura o boleta), si es cliente o proveedor y el plazo de pago
// (para la fecha de vencimiento de la factura). Nada más: lo que no sirve para facturar no va.

import { normalizarRut, rutEsValido } from "./contratos/rut";
import { COMUNAS_POR_REGION, regionDeComuna } from "./contratos/chile-comunas";

export const SLUG_SUBPANEL_CONTACTOS = "contactos";

/** Los largos máximos del XML del SII (ver arriba). */
export const LARGO = {
  razonSocial: 100,
  giro: 40,
  direccion: 70,
  comuna: 20,
  ciudad: 20,
  correo: 80,
  telefono: 40,
  persona: 80,
} as const;

export type TipoPersona = "empresa" | "persona";
export type TipoContribuyente = "primera_categoria" | "segunda_categoria" | "consumidor_final" | "extranjero";

export const ETIQUETA_TIPO_CONTRIBUYENTE: Record<TipoContribuyente, string> = {
  primera_categoria: "Afecto a IVA (1ª categoría)",
  segunda_categoria: "Emite boletas de honorarios (2ª categoría)",
  consumidor_final: "Consumidor final",
  extranjero: "Extranjero",
};

/** Una línea de para qué sirve cada tipo, para el formulario. */
export const AYUDA_TIPO_CONTRIBUYENTE: Record<TipoContribuyente, string> = {
  primera_categoria: "Empresas y personas con giro: se les emite factura.",
  segunda_categoria: "Profesionales independientes que emiten boleta de honorarios.",
  consumidor_final: "Personas sin giro: se les emite boleta.",
  extranjero: "Sin RUT chileno: facturas de exportación.",
};

export const esTipoContribuyente = (v: unknown): v is TipoContribuyente =>
  typeof v === "string" && v in ETIQUETA_TIPO_CONTRIBUYENTE;

export interface DatosContacto {
  rut: string | null;
  tipoPersona: TipoPersona;
  razonSocial: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  pais: string;
  tipoContribuyente: TipoContribuyente;
  correoDte: string | null;
  correo: string | null;
  telefono: string | null;
  esCliente: boolean;
  esProveedor: boolean;
  plazoPagoDias: number | null;
  notas: string | null;
  /** Solo personas: la empresa de la que es contacto. Opcional para lo que viene de Odoo. */
  empresaId?: string | null;
}

export interface Contacto extends DatosContacto {
  id: string;
  activo: boolean;
  odooId: number | null;
  /** Todas las fichas de Odoo que se fundieron en este contacto (duplicados por RUT). */
  odooIds: number[];
  creadoPor: string | null;
  actualizadoPor: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

export interface DatosPersona {
  nombre: string;
  cargo: string | null;
  correo: string | null;
  telefono: string | null;
  principal: boolean;
}

export interface Persona extends DatosPersona {
  id: string;
  contactoId: string;
}

export interface ContactoConPersonas extends Contacto {
  personas: Persona[];
}

// ---------- Texto -------------------------------------------------------------

/** «Maipú», «MAIPU» y «maipu» son lo mismo al buscar. */
export function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// ---------- Nombre Propio -------------------------------------------------------

/** Palabras que van siempre en minúscula dentro de un nombre («Minera de Andes»), salvo la primera. */
const CONECTORES = new Set(["de", "del", "y", "e", "en", "al", "con", "por", "para", "sin", "and", "the"]);

/**
 * Los artículos van con mayúscula cuando son parte del nombre de algo («Av. Las Condes», «Minera Las
 * Cenizas») y en minúscula detrás de una preposición («Roger de Flor», «Juan de la Fuente»).
 */
const ARTICULOS = new Set(["la", "las", "los", "el"]);
const PREPOSICIONES = new Set(["de", "del", "en", "por", "para", "con", "sin", "a"]);

/** Formas fijas: la sociedad y las siglas que se conocen. Se pueden agregar más acá. */
const FORMAS_FIJAS: Record<string, string> = {
  spa: "SpA",
  sa: "S.A.",
  ltda: "Ltda.",
  eirl: "EIRL",
  cia: "Cía.",
  gps: "GPS",
  hdi: "HDI",
  bci: "BCI",
  edp: "EDP",
  yhc: "YHC",
  dhl: "DHL",
  sqm: "SQM",
  tys: "TYS",
  irc: "IRC",
  cpa: "CPA",
  msc: "MSC",
  mlt: "MLT",
  syr: "SYR",
  chm: "CHM",
  ti: "TI",
  sii: "SII",
  iva: "IVA",
  rrhh: "RRHH",
};

const ROMANOS = /^(ii|iii|iv|vi|vii|viii|ix|xi|xii)$/i;

/** Una palabra suelta (sin espacios): «ANDINAS» → «Andinas»; «S.A.» y «SpA» quedan como están. */
function palabraPropia(
  cruda: string,
  ctx: { primera: boolean; suelta: boolean; respetarSiglas: boolean; previa: string },
): string {
  const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}.&]*)$/u.exec(cruda);
  if (!m) return cruda;
  const [, antes, nucleo, despues] = m;
  if (!nucleo) return cruda;
  // «S.A.», «D.M.G.», «E.»: letras sueltas con punto; y «D&C», «M&P»: se escriben en mayúscula.
  if (/^(\p{L}\.)+\p{L}?$/u.test(nucleo) || /^\p{L}(&\p{L})+$/u.test(nucleo)) return antes + nucleo.toUpperCase() + despues;
  const sinPunto = nucleo.replace(/\.$/, "");
  const clave = sinPunto.toLowerCase();
  const forma = FORMAS_FIJAS[clave];
  if (forma) {
    // La forma ya trae su punto («Ltda.», «S.A.»); si no, se conserva el que escribió la persona.
    return antes + (forma.endsWith(".") || !nucleo.endsWith(".") ? forma : `${forma}.`) + despues;
  }
  // Una palabra con su número pegado es una marca («Grafica24»); lo demás con números es un código
  // o una dirección («5711», «P5-L36», «N°6651») y va con las letras en mayúscula.
  if (/\d/.test(nucleo)) {
    return antes + (/^\p{L}{4,}\d+$/u.test(nucleo) ? nucleo[0].toUpperCase() + nucleo.slice(1).toLowerCase() : nucleo.toUpperCase()) + despues;
  }
  if (ROMANOS.test(nucleo)) return antes + nucleo.toUpperCase() + despues;
  // En un texto que ya mezcla («Ingeniero en Confiabilidad – MLA»), una sigla corta en mayúscula es a propósito.
  if (ctx.respetarSiglas && /^\p{Lu}{2,4}$/u.test(nucleo) && !CONECTORES.has(clave) && !ARTICULOS.has(clave)) return antes + nucleo + despues;
  // «McKenzie», «iPhone»: ya trae su propia forma, se respeta.
  if (/\p{Ll}\p{Lu}/u.test(nucleo)) return antes + nucleo + despues;
  const minuscula = nucleo.toLowerCase();
  // Solo una palabra suelta es conector: la «E» de «E-30-F» es una letra de un código.
  if (ctx.suelta && !ctx.primera) {
    if (CONECTORES.has(minuscula)) return antes + minuscula + despues;
    if (ARTICULOS.has(minuscula) && PREPOSICIONES.has(ctx.previa)) return antes + minuscula + despues;
  }
  // «O'Higgins», «D'Alessandro»: cada parte con su mayúscula.
  const titulo = minuscula.replace(/(^|['’])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase());
  return antes + titulo + despues;
}

/**
 * Pone un texto en Nombre Propio: «MINERA DE LOS ANDES SPA» → «Minera de los Andes SpA».
 *
 * Por defecto solo toca lo que está TODO en mayúscula o TODO en minúscula, que es lo que se
 * escribe sin cuidado; un texto que ya mezcla («Minera de los Andes») se deja como lo escribió
 * la persona. Con `siempre` se normaliza igual (para ordenar lo que ya estaba guardado).
 *
 * En una dirección (`direccion`) las palabras cortas en mayúscula son abreviaturas («AV», «OF», «DP»), no
 * siglas, así que también se ordenan.
 *
 * Respeta la sociedad y las siglas conocidas (SpA, S.A., Ltda., EIRL, GPS…), deja las
 * preposiciones en minúscula (de, del, en, y…), conserva los códigos con números (P5-L36) y no
 * inventa tildes: «PEREZ» queda «Perez», no «Pérez».
 */
export function nombrePropio(texto: string, opciones: { siempre?: boolean; direccion?: boolean } = {}): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return limpio;
  // Odoo guarda como «nombre» el correo de quien escribió: sigue siendo un correo.
  if (limpio.includes("@")) return limpio.toLowerCase();
  const tieneMinuscula = /\p{Ll}/u.test(limpio);
  const tieneMayuscula = /\p{Lu}/u.test(limpio);
  if (!opciones.siempre && tieneMinuscula && tieneMayuscula) return limpio;
  const respetarSiglas = tieneMinuscula && tieneMayuscula && !opciones.direccion;
  let previa = "";
  const resultado = limpio
    .split(" ")
    .map((palabra, i) => {
      // «AV-LAS-CONDES», «ALMAGRO/CHILE», «3556,LA»: cada pedazo es una palabra. «AV.E.PEREZ» también.
      const separador = /^\p{L}{2,}\.\p{L}/u.test(palabra) ? /([/,.-])/ : /([/,-])/;
      const pedazos = palabra.split(separador);
      return pedazos
        .map((pedazo, j) => {
          if (j % 2 === 1) return pedazo; // el separador
          const r = palabraPropia(pedazo, { primera: i === 0 && j === 0, suelta: pedazos.length === 1, respetarSiglas, previa });
          const letras = pedazo.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
          if (letras) previa = letras;
          return r;
        })
        .join("");
    })
    .join(" ");
  return (
    resultado
      // «… Central S A», «S. A.», «S.A» → «S.A.»
      .replace(/ S\.? ?A\.?(?=$| |,)/g, " S.A.")
      // «Servicios a la Minería»: «a» solo es preposición delante de un artículo.
      .replace(/ A (?=(?:la|las|los|el)(?: |$))/g, " a ")
  );
}

/** Un correo siempre va en minúscula y sin espacios ni «;» de más. */
export function correoMinuscula(correo: string): string {
  return correo.trim().replace(/[;,\s]+$/, "").toLowerCase();
}

const TODAS_LAS_COMUNAS = Object.values(COMUNAS_POR_REGION).flat();
const COMUNA_POR_CLAVE = new Map(TODAS_LAS_COMUNAS.map((c) => [sinTildes(c), c]));

/** Las 346 comunas oficiales, en orden alfabético, para el buscador del formulario. */
export const COMUNAS_ORDENADAS: readonly string[] = [...TODAS_LAS_COMUNAS].sort((a, b) => a.localeCompare(b, "es"));

/** El nombre oficial de una comuna escrita de cualquier forma («estacion central» → «Estación Central»), o null. */
export function comunaOficial(texto: string | null | undefined): string | null {
  if (!texto) return null;
  return COMUNA_POR_CLAVE.get(sinTildes(texto).replace(/\s+/g, " ")) ?? null;
}

export { regionDeComuna };

/**
 * Lo mínimo para dejar una empresa en la libreta desde otro formulario (al agregar una persona que
 * trabaja en una empresa que todavía no existe). Solo pide la razón social; el RUT, si se escribe,
 * tiene que ser válido. Lo demás (giro, dirección, comuna…) se completa después en su ficha, donde
 * queda «Por completar». Devuelve los datos listos para guardar, o el mensaje de lo que falta.
 */
export function empresaRapida(
  razonCruda: string,
  rutCrudo: string,
  relacion: { esCliente: boolean; esProveedor: boolean },
): DatosContacto | string {
  const razonSocial = nombrePropio(razonCruda);
  if (!razonSocial) return "Escribe la razón social de la empresa.";
  if (razonSocial.length > LARGO.razonSocial) return `La razón social no puede pasar de ${LARGO.razonSocial} caracteres (límite del SII).`;
  const rutTexto = rutCrudo.trim();
  const rut = rutTexto ? normalizarRut(rutTexto) : null;
  if (rut && !rutUsable(rut)) return "El RUT no es válido: revisa el dígito verificador.";
  return {
    rut,
    tipoPersona: "empresa",
    razonSocial,
    giro: null,
    direccion: null,
    comuna: null,
    ciudad: null,
    pais: "Chile",
    tipoContribuyente: "primera_categoria",
    correoDte: null,
    correo: null,
    telefono: null,
    // Hereda la relación de la persona; si no marcó ninguna, es cliente (lo mismo que un contacto nuevo).
    esCliente: relacion.esCliente || !relacion.esProveedor,
    esProveedor: relacion.esProveedor,
    plazoPagoDias: null,
    notas: null,
    empresaId: null,
  };
}

/** Las iniciales para el avatar: «Minera Carola SpA» → «MC». */
export function iniciales(nombre: string): string {
  const palabras = nombre
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((p) => p && !/^(spa|sa|s|a|ltda|limitada|eirl|de|del|la|las|los|y|e)$/i.test(p));
  return (palabras.slice(0, 2).map((p) => p[0]).join("") || nombre.slice(0, 1)).toUpperCase();
}

/**
 * Un RUT que sirve para facturar: el dígito verificador cuadra y el cuerpo está entre 100.000 y
 * 99 millones, como exige el SII. Sin el rango, «00000000-0» —que Odoo usa como relleno— pasaría
 * por válido (su dígito verificador cuadra).
 */
export function rutUsable(entrada: string): boolean {
  if (!rutEsValido(entrada)) return false;
  const cuerpo = Number(normalizarRut(entrada).split("-")[0]);
  return cuerpo >= 100_000 && cuerpo < 100_000_000;
}

export const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

/** RUT de una empresa: en Chile las personas jurídicas van de 50 millones para arriba. */
export function rutDeEmpresa(rut: string): boolean {
  return Number(rut.split("-")[0]) >= 50_000_000;
}

/** El plazo de pago en palabras: 0 → «Contado», 30 → «30 días». */
export function textoPlazo(dias: number | null): string {
  if (dias === null) return "Sin definir";
  return dias === 0 ? "Contado" : `${dias} días`;
}

// ---------- Listo para facturar ----------------------------------------------

export interface Faltante {
  campo: keyof DatosContacto;
  texto: string;
  /** Lo que impide emitir la factura (true) o solo una recomendación (false). */
  bloquea: boolean;
}

/**
 * Lo que le falta a un contacto para poder emitirle una factura electrónica, en el orden en que
 * aparece en el formulario. Vacío (o solo con recomendaciones) = listo para facturar.
 */
export function faltantesParaFacturar(c: DatosContacto): Faltante[] {
  const f: Faltante[] = [];
  const extranjero = c.tipoContribuyente === "extranjero";
  if (!extranjero) {
    if (!c.rut) f.push({ campo: "rut", texto: "Falta el RUT", bloquea: true });
    else if (!rutUsable(c.rut)) f.push({ campo: "rut", texto: "El RUT no es válido", bloquea: true });
  }
  if (!c.razonSocial.trim()) f.push({ campo: "razonSocial", texto: "Falta la razón social", bloquea: true });
  if (!c.giro?.trim()) f.push({ campo: "giro", texto: "Falta el giro", bloquea: true });
  else if (c.giro.length > LARGO.giro) f.push({ campo: "giro", texto: `El giro pasa de ${LARGO.giro} caracteres`, bloquea: true });
  if (!c.direccion?.trim()) f.push({ campo: "direccion", texto: "Falta la dirección", bloquea: true });
  if (!c.comuna?.trim()) f.push({ campo: "comuna", texto: "Falta la comuna", bloquea: true });
  else if (!extranjero && !comunaOficial(c.comuna)) f.push({ campo: "comuna", texto: `«${c.comuna}» no es una comuna de Chile`, bloquea: true });
  if (!c.correoDte?.trim()) f.push({ campo: "correoDte", texto: "Sin correo de intercambio DTE", bloquea: false });
  return f;
}

export function listoParaFacturar(c: DatosContacto): boolean {
  return !faltantesParaFacturar(c).some((x) => x.bloquea);
}

/** Lo que sale en el bloque del receptor de la factura, tal como lo imprime el SII. */
export function bloqueReceptor(c: DatosContacto, atencion?: Pick<DatosPersona, "nombre" | "telefono" | "correo"> | null) {
  return {
    rut: c.tipoContribuyente === "extranjero" ? "55555555-5" : c.rut,
    razonSocial: c.razonSocial.slice(0, LARGO.razonSocial),
    giro: c.giro?.slice(0, LARGO.giro) ?? null,
    direccion: c.direccion,
    comuna: comunaOficial(c.comuna) ?? c.comuna,
    ciudad: c.ciudad,
    contacto: atencion ? [atencion.nombre, atencion.telefono].filter(Boolean).join(" · ").slice(0, 80) : null,
    correoContacto: atencion?.correo ?? null,
  };
}

// ---------- Filtros de la lista ----------------------------------------------

export type FiltroContactos = "todos" | "clientes" | "proveedores" | "por_completar" | "archivados";

export const ETIQUETA_FILTRO: Record<FiltroContactos, string> = {
  todos: "Todos",
  clientes: "Clientes",
  proveedores: "Proveedores",
  por_completar: "Por completar",
  archivados: "Archivados",
};

export const esFiltro = (v: unknown): v is FiltroContactos => typeof v === "string" && v in ETIQUETA_FILTRO;

export function pasaFiltro(c: Contacto, filtro: FiltroContactos): boolean {
  if (filtro === "archivados") return !c.activo;
  if (!c.activo) return false;
  if (filtro === "clientes") return c.esCliente;
  if (filtro === "proveedores") return c.esProveedor;
  if (filtro === "por_completar") return !listoParaFacturar(c);
  return true;
}

/** Busca por RUT (con o sin puntos), razón social, giro, comuna o correo, sin tildes. */
export function coincideBusqueda(c: Contacto, texto: string): boolean {
  const q = sinTildes(texto);
  if (!q) return true;
  const rutBuscado = q.replace(/[^0-9k]/g, "");
  if (rutBuscado.length >= 3 && c.rut && c.rut.replace("-", "").toLowerCase().includes(rutBuscado)) return true;
  return [c.razonSocial, c.giro, c.comuna, c.correo, c.correoDte].some((x) => x && sinTildes(x).includes(q));
}

// ---------- Desde Odoo ---------------------------------------------------------

/** Una fila de res.partner tal como la devuelve search_read (los campos que se leen). */
export interface FilaOdoo {
  id: number;
  name: string | false;
  active: boolean;
  is_company: boolean;
  parent_id: [number, string] | false;
  type: string | false;
  vat: string | false;
  l10n_cl_sii_taxpayer_type: string | false;
  l10n_cl_activity_description: string | false;
  l10n_cl_dte_email: string | false;
  street: string | false;
  street2: string | false;
  city: string | false;
  country_id: [number, string] | false;
  email: string | false;
  phone: string | false;
  function: string | false;
  customer_rank: number;
  supplier_rank: number;
  property_payment_term_id: [number, string] | false;
  employee_ids: number[];
}

export const CAMPOS_ODOO: (keyof FilaOdoo)[] = [
  "id", "name", "active", "is_company", "parent_id", "type", "vat", "l10n_cl_sii_taxpayer_type",
  "l10n_cl_activity_description", "l10n_cl_dte_email", "street", "street2", "city", "country_id",
  "email", "phone", "function", "customer_rank", "supplier_rank", "property_payment_term_id", "employee_ids",
];

export interface PersonaImportada extends DatosPersona {
  odooId: number;
}

export interface ContactoImportado extends DatosContacto {
  odooId: number;
  odooIds: number[];
  personas: PersonaImportada[];
}

export interface ResultadoTraduccion {
  contactos: ContactoImportado[];
  omitidos: { odooId: number; nombre: string; motivo: string }[];
}

const DOMINIOS_GENERICOS = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "live.com", "icloud.com", "pertec.cl"]);

const t = (v: string | false | null | undefined) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "") || null;
/** Lo mismo pero en Nombre Propio: lo que viene de Odoo llega en mayúsculas, minúsculas o mezclado. */
const np = (v: string | false | null | undefined, direccion = false) => {
  const x = t(v);
  return x ? nombrePropio(x, { siempre: true, direccion }) : null;
};
const correoDe = (v: string | false | null | undefined) => {
  const x = t(v);
  return x ? correoMinuscula(x) : null;
};
const pareceCorreo = (v: string) => /^\S+@\S+$/.test(v.trim());
const dominio = (correo: string | null) => correo?.toLowerCase().split("@")[1]?.replace(/[;,\s]+$/, "") ?? null;

const TIPO_ODOO: Record<string, TipoContribuyente> = {
  "1": "primera_categoria",
  "2": "segunda_categoria",
  "3": "consumidor_final",
  "4": "extranjero",
};

function plazoDesdeOdoo(termino: [number, string] | false): number | null {
  if (!termino) return null;
  if (/immediate|inmediat|contado/i.test(termino[1]) && !/cr[eé]dito/i.test(termino[1])) return 0;
  const m = /^(\d+)\s*(days?|d[ií]as)$/i.exec(termino[1].trim());
  return m ? Number(m[1]) : null;
}

/** Cuántos datos útiles trae una fila: para elegir la «principal» entre duplicados. */
function riqueza(f: FilaOdoo): number {
  return [f.vat, f.l10n_cl_activity_description, f.street, f.city, f.l10n_cl_dte_email, f.email, f.phone, f.l10n_cl_sii_taxpayer_type].filter(Boolean).length + (f.is_company ? 0.5 : 0);
}

/**
 * Traduce los contactos de Odoo (res.partner) a fichas del Core.
 *
 *  · Quedan fuera el personal de PERTEC (empleados y correos @pertec.cl), las empresas propias
 *    (`propias`: los partner de res.company), los usuarios de sistema (archivados sin RUT) y las
 *    fichas de prueba.
 *  · Los contactos que cuelgan de una empresa en Odoo pasan a ser sus personas de contacto.
 *  · Las fichas con el mismo RUT —Odoo tiene varios duplicados— se funden en una: manda la más
 *    completa y las demás rellenan lo que le falte. Lo que no calza (otra dirección, otro nombre)
 *    queda en las notas, para no perder nada. Sin RUT, se funden por nombre idéntico.
 *  · Una persona suelta, sin RUT, que no es cliente ni proveedor (Odoo crea una por cada correo que
 *    llega), se cuelga de la empresa con el mismo dominio de correo si hay una sola; si no, se omite.
 *  · Nada se inventa: lo que falta queda vacío y la ficha sale «Por completar».
 */
export function contactosDesdeOdoo(filas: FilaOdoo[], propias: number[]): ResultadoTraduccion {
  const omitidos: ResultadoTraduccion["omitidos"] = [];
  const propiasSet = new Set(propias);
  const nombre = (f: FilaOdoo) => np(f.name) ?? `Contacto ${f.id}`;

  const fuera = new Map<number, string>();
  for (const f of filas) {
    const correo = t(f.email) ?? "";
    let motivo: string | null = null;
    if (propiasSet.has(f.id)) motivo = "Empresa propia";
    else if (f.employee_ids?.length || /@pertec\.cl$/i.test(correo)) motivo = "Personal de PERTEC";
    else if (!f.active && !f.vat) motivo = "Usuario de sistema de Odoo";
    else if (/^(test|prueba)$/i.test(nombre(f))) motivo = "Ficha de prueba";
    if (motivo) fuera.set(f.id, motivo);
  }

  const raices = filas.filter((f) => !f.parent_id && !fuera.has(f.id));
  const hijos = filas.filter((f) => f.parent_id && !fuera.has(f.id));
  for (const [id, motivo] of fuera) {
    const f = filas.find((x) => x.id === id)!;
    if (!f.parent_id) omitidos.push({ odooId: id, nombre: nombre(f), motivo });
  }

  // Raíces: con RUT válido se agrupan por RUT; sin RUT, las empresas y las que tienen rango de
  // cliente/proveedor se agrupan por nombre; las personas sueltas se dejan para el final.
  const grupos = new Map<string, FilaOdoo[]>();
  const sueltas: FilaOdoo[] = [];
  const rutInvalido = new Map<number, string>();
  for (const f of raices) {
    const crudo = t(f.vat);
    const rut = crudo ? normalizarRut(crudo) : null;
    const valido = rut && rutUsable(rut) ? rut : null;
    if (crudo && !valido) rutInvalido.set(f.id, crudo);
    let clave: string | null = null;
    if (valido) clave = `rut:${valido}`;
    else if (f.is_company || f.customer_rank > 0 || f.supplier_rank > 0 || crudo) clave = `nombre:${sinTildes(nombre(f)).replace(/[^a-z0-9]/g, "")}`;
    if (clave) grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
    else sueltas.push(f);
  }

  const contactos: ContactoImportado[] = [];
  const porOdooId = new Map<number, ContactoImportado>();

  for (const [clave, grupo] of grupos) {
    grupo.sort((a, b) => riqueza(b) - riqueza(a) || a.id - b.id);
    const [p, ...resto] = grupo;
    const primero = <K extends keyof FilaOdoo>(k: K) => grupo.map((g) => g[k]).find((v) => v && !(Array.isArray(v) && v.length === 0)) ?? false;
    const rut = clave.startsWith("rut:") ? clave.slice(4) : null;
    const notas: string[] = [];

    // Dirección: calle y complemento si caben en los 70 del SII; si no, el complemento a notas.
    // Calle y complemento de la MISMA ficha: mezclarlos de dos duplicados repite la dirección.
    const conCalle = grupo.find((g) => t(g.street) || t(g.street2));
    const calle = np(conCalle?.street, true);
    const calle2 = np(conCalle?.street2, true);
    let direccion = calle;
    if (calle && calle2) {
      if (`${calle}, ${calle2}`.length <= LARGO.direccion) direccion = `${calle}, ${calle2}`;
      else notas.push(`Complemento de la dirección: ${calle2}`);
    } else if (!calle && calle2) direccion = calle2;
    if (direccion && direccion.length > LARGO.direccion) {
      notas.push(`Dirección completa en Odoo: ${direccion}`);
      direccion = direccion.slice(0, LARGO.direccion);
    }

    const pais = (primero("country_id") as [number, string] | false) || null;
    const enChile = !pais || pais[1] === "Chile";
    const ciudadOdoo = np(primero("city") as string | false);
    const comuna = enChile ? (comunaOficial(ciudadOdoo) ?? ciudadOdoo?.slice(0, LARGO.comuna) ?? null) : null;

    const tipoOdoo = t(primero("l10n_cl_sii_taxpayer_type") as string | false);
    const tipoContribuyente: TipoContribuyente = tipoOdoo && TIPO_ODOO[tipoOdoo] ? TIPO_ODOO[tipoOdoo] : enChile ? "primera_categoria" : "extranjero";

    for (const g of resto) {
      if (np(g.name) && sinTildes(np(g.name)!) !== sinTildes(nombre(p))) notas.push(`En Odoo también figuraba como «${np(g.name)}» (id ${g.id}).`);
      const otraDir = [np(g.street, true), np(g.city)].filter(Boolean).join(", ");
      const dirPrincipal = [calle, ciudadOdoo].filter(Boolean).join(", ");
      if (otraDir && sinTildes(otraDir) !== sinTildes(dirPrincipal)) notas.push(`Otra dirección en Odoo: ${otraDir}.`);
    }
    for (const g of grupo) if (rutInvalido.has(g.id)) notas.push(`RUT en Odoo no válido: ${rutInvalido.get(g.id)}.`);
    const giro = np(primero("l10n_cl_activity_description") as string | false);

    const c: ContactoImportado = {
      rut,
      tipoPersona: rut ? (rutDeEmpresa(rut) ? "empresa" : "persona") : p.is_company ? "empresa" : "persona",
      razonSocial: nombre(p).slice(0, LARGO.razonSocial),
      giro: giro?.slice(0, 200) ?? null,
      direccion,
      comuna,
      ciudad: enChile ? null : ciudadOdoo?.slice(0, LARGO.ciudad) ?? null,
      pais: pais ? pais[1] : "Chile",
      tipoContribuyente,
      correoDte: correoDe(primero("l10n_cl_dte_email") as string | false)?.slice(0, LARGO.correo) ?? null,
      correo: correoDe(primero("email") as string | false)?.slice(0, LARGO.correo) ?? null,
      telefono: t(primero("phone") as string | false)?.slice(0, LARGO.telefono) ?? null,
      esCliente: grupo.some((g) => g.customer_rank > 0),
      esProveedor: grupo.some((g) => g.supplier_rank > 0),
      plazoPagoDias: plazoDesdeOdoo(primero("property_payment_term_id") as [number, string] | false),
      notas: notas.length ? [...new Set(notas)].join("\n") : null,
      odooId: p.id,
      odooIds: grupo.map((g) => g.id).sort((a, b) => a - b),
      personas: [],
    };
    contactos.push(c);
    for (const g of grupo) porOdooId.set(g.id, c);
  }

  const agregarPersona = (c: ContactoImportado, f: FilaOdoo): boolean => {
    const n = nombre(f);
    const correo = correoDe(f.email);
    // Odoo a veces guarda la dirección de facturación como un «contacto» que se llama como el RUT.
    if (!correo && !t(f.phone) && (/^[\d.\-kK\s]+$/.test(n) || n === c.razonSocial)) return false;
    if (c.personas.some((x) => sinTildes(x.nombre) === sinTildes(n) && (x.correo ?? "") === (correo ?? ""))) return false;
    c.personas.push({
      nombre: n.slice(0, LARGO.persona),
      cargo: np(f.function)?.slice(0, 80) ?? null,
      correo: correo?.slice(0, LARGO.correo) ?? null,
      telefono: t(f.phone)?.slice(0, LARGO.telefono) ?? null,
      principal: false,
      odooId: f.id,
    });
    return true;
  };

  // Hijos: cuelgan de la ficha a la que fue a parar su empresa (aunque se haya fundido con otra).
  for (const f of hijos) {
    const padre = porOdooId.get((f.parent_id as [number, string])[0]);
    if (!padre) {
      const motivo = fuera.get((f.parent_id as [number, string])[0]);
      omitidos.push({ odooId: f.id, nombre: nombre(f), motivo: motivo ? `Contacto de: ${motivo.toLowerCase()}` : "Su empresa no se importó" });
      continue;
    }
    if (!agregarPersona(padre, f)) omitidos.push({ odooId: f.id, nombre: nombre(f), motivo: "Duplicado o sin datos de contacto" });
  }

  // Personas sueltas: a la única empresa con el mismo dominio de correo.
  const porDominio = new Map<string, Set<ContactoImportado>>();
  for (const c of contactos) {
    for (const correo of [c.correo, c.correoDte, ...c.personas.map((x) => x.correo)]) {
      const d = dominio(correo);
      if (d && !DOMINIOS_GENERICOS.has(d) && !d.includes("einvoicing")) porDominio.set(d, (porDominio.get(d) ?? new Set()).add(c));
    }
  }
  for (const f of sueltas) {
    const d = dominio(t(f.email) ?? (pareceCorreo(nombre(f)) ? nombre(f) : null));
    const candidatas = d ? porDominio.get(d) : undefined;
    if (candidatas?.size === 1) {
      const [c] = candidatas;
      if (agregarPersona(c, f)) continue;
    }
    omitidos.push({ odooId: f.id, nombre: nombre(f), motivo: "Persona sin RUT ni empresa (no es cliente ni proveedor)" });
  }

  // La primera persona de cada empresa queda como «Atención A:» (se cambia en la ficha).
  for (const c of contactos) if (c.personas.length) c.personas[0].principal = true;

  contactos.sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, "es"));
  return { contactos, omitidos };
}
