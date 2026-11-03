// El vocabulario de la Valorización histórica: el registro maestro de compras de materiales,
// herramientas y EPP (DTE recibidos del SII), traído tal cual desde su Excel y solo para consulta.
//
// Sin "server-only": lo usan las páginas (servidor), el buscador y la plantilla de conteo (cliente)
// y las pruebas. Las cuentas son las MISMAS que hace el Excel con sus fórmulas (SUMIFS, MINIFS,
// LOOKUP…), escritas una vez acá para que el Core diga lo mismo que la planilla.

export const SLUG_APP_VH = "valorizacion-historica";
export const RUTA_VH = "/valorizacion-historica";

// -----------------------------------------------------------------------------
//  Tipos (espejo de las tablas vh_*)
// -----------------------------------------------------------------------------

/** Una línea de glosa de una factura, nota de crédito o nota de débito (hoja «Detalle compras»). */
export interface LineaCompra {
  n: number;
  /** YYYY-MM-DD, fecha de emisión del documento. */
  fecha: string;
  tipoDocumento: string;
  folio: number;
  rut: string;
  proveedor: string;
  codigoProveedor: string | null;
  glosa: string;
  producto: string | null;
  marca: string | null;
  modelo: string | null;
  talla: string | null;
  categoria: string;
  subcategoria: string;
  tipoItem: string;
  /** Negativa en las notas de crédito. Vacía cuando la glosa no la trae. */
  cantidad: number | null;
  unidad: string | null;
  precioUnitario: number | null;
  /** 0,21 = 21 %. */
  descuentoLinea: number | null;
  valorLinea: number;
  factorDescuentoGlobal: number;
  /** Neto después del descuento global prorrateado: la base de todos los montos. */
  valorAjustado: number;
  costoUnitario: number | null;
  estadoCuadratura: string;
  revisar: boolean;
  /** Ruta del PDF dentro de DTE_SII («2022/09 Septiembre/DTE_R_CODIGO_1666421196.pdf»). */
  pdf: string | null;
  referencias: string | null;
  /** La glosa normalizada: agrupa las líneas de un mismo ítem del catálogo. */
  clave: string;
}

/** Un documento con al menos una línea en alcance (hoja «Facturas»). Montos del documento completo. */
export interface DocumentoCompra {
  n: number;
  fecha: string;
  tipo: string;
  folio: number;
  rut: string;
  proveedor: string;
  direccion: string | null;
  comuna: string | null;
  contactoPertec: string | null;
  montoNeto: number;
  montoExento: number;
  iva: number;
  impuestoAdicional: number;
  total: number;
  estadoCuadratura: string;
  referencias: string | null;
  pdf: string | null;
}

export interface ProveedorCompra {
  rut: string;
  razonSocial: string;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  email: string | null;
  contactoPertec: string | null;
  categoriaPrincipal: string | null;
}

export interface CategoriaCompra {
  categoria: string;
  subcategoria: string;
  tipoItem: string;
  criterio: string | null;
  orden: number;
}

export interface FilaUniverso {
  concepto: string;
  documentos: number | null;
  monto: number | null;
  tratamiento: string | null;
}

export interface FilaDestino {
  destino: string;
  lineas: number;
  monto: number;
  enAlcance: boolean;
}

export interface Duplicado {
  archivo: string;
  tipo: string;
  folio: number | null;
  rut: string | null;
  fecha: string | null;
  proveedor: string | null;
}

/** Hoja «Control y observaciones»: de dónde salió el registro y qué tan limpio está. */
export interface ControlRegistro {
  universo: FilaUniverso[];
  porTipo: FilaUniverso[];
  destinos: FilaDestino[];
  observaciones: { concepto: string; valor: number }[];
  metodologia: string[];
  duplicados: Duplicado[];
}

export interface Importacion {
  id: string;
  archivo: string;
  creadoPor: string | null;
  creadoEn: string;
  desde: string | null;
  hasta: string | null;
  lineas: number;
  documentos: number;
  proveedores: number;
  montoTotal: number;
}

export interface DatosHistoricos {
  importacion: Importacion | null;
  lineas: LineaCompra[];
  documentos: DocumentoCompra[];
  proveedores: ProveedorCompra[];
  categorias: CategoriaCompra[];
  control: ControlRegistro;
}

export const CONTROL_VACIO: ControlRegistro = { universo: [], porTipo: [], destinos: [], observaciones: [], metodologia: [], duplicados: [] };

// -----------------------------------------------------------------------------
//  Formato
// -----------------------------------------------------------------------------

export function monto(n: number): string {
  return Math.round(n).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

/** $1.171 M / $830 mil / $9.500: para tarjetas y gráficos. */
export function montoCorto(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `$${(n / 1_000_000_000).toLocaleString("es-CL", { maximumFractionDigits: 2 })} mil M`;
  if (a >= 1_000_000) return `$${(n / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M`;
  if (a >= 10_000) return `$${Math.round(n / 1000).toLocaleString("es-CL")} mil`;
  return monto(n);
}

export function cantidad(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("es-CL", { maximumFractionDigits: 2 });
}

export function pct(x: number, decimales = 1): string {
  return `${(x * 100).toLocaleString("es-CL", { maximumFractionDigits: decimales })}%`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** 2024-03-07 → 07 mar 2024. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d} ${MESES[Number(m) - 1] ?? m} ${a}`;
}

export const anioDe = (iso: string) => Number(iso.slice(0, 4));

/**
 * La unidad como se lee: cada proveedor escribe «unidad» a su manera (UN, Un, UND, UNID, C/U…).
 * Solo para mostrar y para avisar cuando una búsqueda suma unidades distintas; en la base queda
 * lo que dice la factura.
 */
export function unidadLegible(u: string | null | undefined): string {
  const t = (u ?? "").trim().toUpperCase().replace(/\.$/, "");
  if (!t) return "";
  if (["UN", "UND", "UNID", "UNI", "U", "C/U", "CU", "UNIDAD", "UNIDADES", "UDS", "UD"].includes(t)) return "UN";
  if (["PR", "PAR", "PARES"].includes(t)) return "PAR";
  if (["MT", "MTS", "METR", "METRO", "METROS", "M", "ML"].includes(t)) return "M";
  if (["JG", "JGO", "JUEGO"].includes(t)) return "JUEGO";
  if (["CJ", "CAJA"].includes(t)) return "CAJA";
  if (["KG", "KGS", "KILO"].includes(t)) return "KG";
  if (["LT", "LTS", "L", "LITRO"].includes(t)) return "LT";
  return t;
}

/** El nombre del archivo del PDF, sin la carpeta. */
export function nombrePdf(ruta: string | null): string | null {
  if (!ruta) return null;
  return ruta.split("/").pop() ?? ruta;
}

// -----------------------------------------------------------------------------
//  Búsqueda (lo que hace la hoja «Buscador», un poco más amable)
// -----------------------------------------------------------------------------

/** Minúsculas y sin tildes: «Guantes» encuentra «GUANTE», «medicion» encuentra «medición». */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Lo que revisa el buscador de cada línea: glosa, producto, marca, modelo, proveedor y subcategoría (como el Excel), más código, folio y RUT. */
export function textoDeLinea(l: LineaCompra): string {
  return normalizar(
    [l.glosa, l.producto, l.marca, l.modelo, l.proveedor, l.subcategoria, l.codigoProveedor, String(l.folio), l.rut].filter(Boolean).join(" | "),
  );
}

/**
 * Convierte lo escrito en una prueba. Cada palabra tiene que aparecer (en cualquier orden); dentro de
 * una palabra, `*` es «cualquier cosa» y `?` «un carácter», igual que en el Excel: «taladro*makita»
 * exige las dos en ese orden. Sin nada escrito, todo pasa.
 */
export function compilarBusqueda(q: string): (texto: string) => boolean {
  const palabras = normalizar(q).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return () => true;
  const pruebas = palabras.map((p) => {
    if (!/[*?]/.test(p)) return (t: string) => t.includes(p);
    const patron = p
      .split("")
      .map((c) => (c === "*" ? ".*" : c === "?" ? "." : c.replace(/[.+^${}()|[\]\\]/g, "\\$&")))
      .join("");
    const re = new RegExp(patron);
    return (t: string) => re.test(t);
  });
  return (texto) => pruebas.every((prueba) => prueba(texto));
}

export interface FiltrosBusqueda {
  q?: string;
  categoria?: string;
  anio?: number;
  proveedor?: string;
  tipoItem?: string;
  soloRevisar?: boolean;
}

/** Filtra las líneas como el Buscador del Excel. `textos` es textoDeLinea precalculado (mismo orden). */
export function filtrarLineas(lineas: LineaCompra[], f: FiltrosBusqueda, textos?: string[]): LineaCompra[] {
  const coincide = compilarBusqueda(f.q ?? "");
  const prov = f.proveedor ? normalizar(f.proveedor.trim()) : "";
  return lineas.filter((l, i) => {
    if (f.categoria && l.categoria !== f.categoria) return false;
    if (f.anio && anioDe(l.fecha) !== f.anio) return false;
    if (f.tipoItem && l.tipoItem !== f.tipoItem) return false;
    if (f.soloRevisar && !l.revisar) return false;
    if (prov && !normalizar(`${l.proveedor} ${l.rut}`).includes(prov)) return false;
    return coincide(textos?.[i] ?? textoDeLinea(l));
  });
}

/** Lo más reciente primero (fecha y, dentro del día, el orden del registro). */
export function masRecientesPrimero(a: LineaCompra, b: LineaCompra): number {
  return b.fecha.localeCompare(a.fecha) || b.n - a.n;
}

export interface ResumenLineas {
  lineas: number;
  cantidad: number;
  monto: number;
  costoMin: number | null;
  costoMax: number | null;
  /** El de la compra más reciente con cantidad positiva (el «último costo» del Excel). */
  ultimoCosto: number | null;
  ultimaFecha: string | null;
  ultimoProveedor: string | null;
  primeraFecha: string | null;
  documentos: number;
  proveedores: number;
  /** Las unidades distintas que se están sumando: con más de una, la cantidad total es referencial. */
  unidades: string[];
}

/**
 * Las cifras de arriba del Buscador. Mínimo, máximo y último costo miran solo compras con cantidad
 * positiva (una nota de crédito no es un precio), como MINIFS/MAXIFS/LOOKUP en la planilla.
 */
export function resumirLineas(lineas: LineaCompra[]): ResumenLineas {
  let cant = 0, total = 0;
  let min: number | null = null, max: number | null = null;
  let ultima: LineaCompra | null = null;
  let primera: string | null = null;
  const docs = new Set<string>(), provs = new Set<string>(), unidades = new Set<string>();
  for (const l of lineas) {
    cant += l.cantidad ?? 0;
    total += l.valorAjustado;
    docs.add(`${l.rut}|${l.tipoDocumento}|${l.folio}`);
    provs.add(l.rut);
    const u = unidadLegible(l.unidad);
    if (u) unidades.add(u);
    if (!primera || l.fecha < primera) primera = l.fecha;
    if ((l.cantidad ?? 0) > 0 && l.costoUnitario !== null) {
      min = min === null ? l.costoUnitario : Math.min(min, l.costoUnitario);
      max = max === null ? l.costoUnitario : Math.max(max, l.costoUnitario);
      if (!ultima || l.fecha > ultima.fecha || (l.fecha === ultima.fecha && l.n > ultima.n)) ultima = l;
    }
  }
  return {
    lineas: lineas.length,
    cantidad: cant,
    monto: total,
    costoMin: min,
    costoMax: max,
    ultimoCosto: ultima?.costoUnitario ?? null,
    ultimaFecha: ultima?.fecha ?? null,
    ultimoProveedor: ultima?.proveedor ?? null,
    primeraFecha: primera,
    documentos: docs.size,
    proveedores: provs.size,
    unidades: [...unidades].sort(),
  };
}

// -----------------------------------------------------------------------------
//  Catálogo (hoja «Catálogo productos»)
// -----------------------------------------------------------------------------

export interface ItemCatalogo {
  clave: string;
  categoria: string;
  subcategoria: string;
  tipoItem: string;
  producto: string | null;
  marca: string | null;
  modelo: string | null;
  talla: string | null;
  unidad: string | null;
  compras: number;
  cantidad: number;
  monto: number;
  /** Monto neto / cantidad neta: el costo contable. Null si la cantidad neta no es positiva. */
  costoPromedio: number | null;
  costoMin: number | null;
  costoMax: number | null;
  /** El costo de reposición: lo que costó la última vez. */
  ultimoCosto: number | null;
  ultimaFecha: string | null;
  ultimoProveedor: string | null;
  primeraFecha: string | null;
  proveedores: number;
}

/** Agrupa las líneas por ítem (glosa normalizada), del que más se compró en plata al que menos. */
export function armarCatalogo(lineas: LineaCompra[]): ItemCatalogo[] {
  const grupos = new Map<string, LineaCompra[]>();
  for (const l of lineas) {
    const g = grupos.get(l.clave);
    if (g) g.push(l);
    else grupos.set(l.clave, [l]);
  }
  const items: ItemCatalogo[] = [];
  for (const [clave, ls] of grupos) {
    const r = resumirLineas(ls);
    // La descripción (categoría, marca…) se toma de la línea más reciente: la clasificación vigente.
    const ref = ls.reduce((a, b) => (masRecientesPrimero(a, b) <= 0 ? a : b));
    const conCantidad = ls.filter((l) => l.unidad).sort(masRecientesPrimero)[0];
    items.push({
      clave,
      categoria: ref.categoria,
      subcategoria: ref.subcategoria,
      tipoItem: ref.tipoItem,
      producto: ref.producto,
      marca: ref.marca,
      modelo: ref.modelo,
      talla: ref.talla,
      unidad: conCantidad?.unidad ?? null,
      compras: ls.length,
      cantidad: r.cantidad,
      monto: r.monto,
      costoPromedio: r.cantidad > 0 ? r.monto / r.cantidad : null,
      costoMin: r.cantidad > 0 ? r.costoMin : null,
      costoMax: r.cantidad > 0 ? r.costoMax : null,
      ultimoCosto: r.ultimoCosto,
      ultimaFecha: r.ultimaFecha,
      ultimoProveedor: r.ultimoProveedor,
      primeraFecha: r.primeraFecha,
      proveedores: r.proveedores,
    });
  }
  return items.sort((a, b) => b.monto - a.monto || a.clave.localeCompare(b.clave));
}

/** Variación entre el primer y el último costo de un ítem (+0,25 = subió 25 %). Null si no hay dos precios. */
export function variacionDeCosto(lineas: LineaCompra[]): number | null {
  const compras = lineas.filter((l) => (l.cantidad ?? 0) > 0 && l.costoUnitario).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.n - b.n);
  if (compras.length < 2) return null;
  const primero = compras[0].costoUnitario!, ultimo = compras[compras.length - 1].costoUnitario!;
  return primero > 0 ? ultimo / primero - 1 : null;
}

// -----------------------------------------------------------------------------
//  Resumen (hoja «Resumen»)
// -----------------------------------------------------------------------------

export interface Grupo {
  nombre: string;
  monto: number;
  participacion: number;
  lineas: number;
}

export interface GrupoCategoria extends Grupo {
  porAnio: Record<number, number>;
}

export interface FilaAnio {
  anio: number;
  monto: number;
  participacion: number;
  documentos: number;
  /** Meses con compras: 2022 parte en septiembre y el último año puede estar a medias. */
  desde: string;
  hasta: string;
}

export interface ResumenGeneral {
  total: number;
  documentos: number;
  proveedores: number;
  lineas: number;
  items: number;
  desde: string | null;
  hasta: string | null;
  anios: number[];
  porAnio: FilaAnio[];
  porCategoria: GrupoCategoria[];
  porTipoItem: Grupo[];
  porRevisar: { lineas: number; monto: number };
}

export function resumirRegistro(d: Pick<DatosHistoricos, "lineas" | "documentos" | "proveedores">): ResumenGeneral {
  const total = d.lineas.reduce((s, l) => s + l.valorAjustado, 0);
  const share = (x: number) => (total === 0 ? 0 : x / total);
  const anios = new Map<number, FilaAnio>();
  const cats = new Map<string, GrupoCategoria>();
  const tipos = new Map<string, Grupo>();
  let desde: string | null = null, hasta: string | null = null;
  const porRevisar = { lineas: 0, monto: 0 };

  for (const l of d.lineas) {
    const a = anioDe(l.fecha);
    const fa = anios.get(a) ?? { anio: a, monto: 0, participacion: 0, documentos: 0, desde: l.fecha, hasta: l.fecha };
    fa.monto += l.valorAjustado;
    if (l.fecha < fa.desde) fa.desde = l.fecha;
    if (l.fecha > fa.hasta) fa.hasta = l.fecha;
    anios.set(a, fa);

    const c = cats.get(l.categoria) ?? { nombre: l.categoria, monto: 0, participacion: 0, lineas: 0, porAnio: {} };
    c.monto += l.valorAjustado;
    c.lineas++;
    c.porAnio[a] = (c.porAnio[a] ?? 0) + l.valorAjustado;
    cats.set(l.categoria, c);

    const t = tipos.get(l.tipoItem) ?? { nombre: l.tipoItem, monto: 0, participacion: 0, lineas: 0 };
    t.monto += l.valorAjustado;
    t.lineas++;
    tipos.set(l.tipoItem, t);

    if (l.revisar) {
      porRevisar.lineas++;
      porRevisar.monto += l.valorAjustado;
    }
    if (!desde || l.fecha < desde) desde = l.fecha;
    if (!hasta || l.fecha > hasta) hasta = l.fecha;
  }
  for (const doc of d.documentos) {
    const fa = anios.get(anioDe(doc.fecha));
    if (fa) fa.documentos++;
  }
  const conShare = <T extends { monto: number; participacion: number }>(xs: Iterable<T>) =>
    [...xs].map((x) => ({ ...x, participacion: share(x.monto) })).sort((a, b) => b.monto - a.monto);

  const porAnio = [...anios.values()].map((x) => ({ ...x, participacion: share(x.monto) })).sort((a, b) => a.anio - b.anio);
  return {
    total,
    documentos: d.documentos.length,
    proveedores: d.proveedores.length,
    lineas: d.lineas.length,
    items: new Set(d.lineas.map((l) => l.clave)).size,
    desde,
    hasta,
    anios: porAnio.map((x) => x.anio),
    porAnio,
    porCategoria: conShare(cats.values()),
    porTipoItem: conShare(tipos.values()),
    porRevisar,
  };
}

// -----------------------------------------------------------------------------
//  Documentos y proveedores
// -----------------------------------------------------------------------------

/** La llave de un documento: el mismo folio puede repetirse entre proveedores y entre tipos. */
export const claveDocumento = (x: { rut: string; tipo?: string; tipoDocumento?: string; folio: number }) =>
  `${x.rut}|${x.tipo ?? x.tipoDocumento}|${x.folio}`;

export interface DocumentoConAlcance extends DocumentoCompra {
  /** Suma de sus líneas de materiales, herramientas y EPP. */
  montoAlcance: number;
  lineasAlcance: number;
  /** Monto en alcance / (neto + exento). */
  participacion: number | null;
}

export function documentosConAlcance(documentos: DocumentoCompra[], lineas: LineaCompra[]): DocumentoConAlcance[] {
  const porDoc = new Map<string, { monto: number; lineas: number }>();
  for (const l of lineas) {
    const k = claveDocumento(l);
    const x = porDoc.get(k) ?? { monto: 0, lineas: 0 };
    x.monto += l.valorAjustado;
    x.lineas++;
    porDoc.set(k, x);
  }
  return documentos.map((doc) => {
    const x = porDoc.get(claveDocumento(doc)) ?? { monto: 0, lineas: 0 };
    const base = doc.montoNeto + doc.montoExento;
    return { ...doc, montoAlcance: x.monto, lineasAlcance: x.lineas, participacion: base === 0 ? null : x.monto / base };
  });
}

export interface ProveedorConCifras extends ProveedorCompra {
  documentos: number;
  primeraCompra: string | null;
  ultimaCompra: string | null;
  monto: number;
  participacion: number;
  lineas: number;
  items: number;
}

export function proveedoresConCifras(proveedores: ProveedorCompra[], documentos: DocumentoCompra[], lineas: LineaCompra[]): ProveedorConCifras[] {
  const total = lineas.reduce((s, l) => s + l.valorAjustado, 0);
  const docs = new Map<string, { n: number; primera: string; ultima: string }>();
  for (const d of documentos) {
    const x = docs.get(d.rut);
    if (!x) docs.set(d.rut, { n: 1, primera: d.fecha, ultima: d.fecha });
    else {
      x.n++;
      if (d.fecha < x.primera) x.primera = d.fecha;
      if (d.fecha > x.ultima) x.ultima = d.fecha;
    }
  }
  const montos = new Map<string, { monto: number; lineas: number; items: Set<string> }>();
  for (const l of lineas) {
    const x = montos.get(l.rut) ?? { monto: 0, lineas: 0, items: new Set<string>() };
    x.monto += l.valorAjustado;
    x.lineas++;
    x.items.add(l.clave);
    montos.set(l.rut, x);
  }
  return proveedores
    .map((p) => {
      const d = docs.get(p.rut), m = montos.get(p.rut);
      return {
        ...p,
        documentos: d?.n ?? 0,
        primeraCompra: d?.primera ?? null,
        ultimaCompra: d?.ultima ?? null,
        monto: m?.monto ?? 0,
        participacion: total === 0 ? 0 : (m?.monto ?? 0) / total,
        lineas: m?.lineas ?? 0,
        items: m?.items.size ?? 0,
      };
    })
    .sort((a, b) => b.monto - a.monto);
}

// -----------------------------------------------------------------------------
//  Filtros de las listas (los usan las pantallas y la exportación, para que el CSV traiga lo mismo)
// -----------------------------------------------------------------------------

export function filtrarCatalogo(items: ItemCatalogo[], f: { q?: string; categoria?: string; tipo?: string }): ItemCatalogo[] {
  const coincide = compilarBusqueda(f.q ?? "");
  return items.filter(
    (i) =>
      (!f.categoria || i.categoria === f.categoria) &&
      (!f.tipo || i.tipoItem === f.tipo) &&
      coincide(normalizar([i.clave, i.producto, i.marca, i.modelo, i.subcategoria, i.ultimoProveedor].filter(Boolean).join(" | "))),
  );
}

/** `cuadra` = solo los que tienen descuento global o no cuadran (los que conviene mirar). */
export function filtrarDocumentos<D extends DocumentoCompra>(docs: D[], f: { q?: string; anio?: number; tipo?: string; cuadra?: boolean }): D[] {
  const coincide = compilarBusqueda(f.q ?? "");
  return docs.filter(
    (d) =>
      (!f.anio || anioDe(d.fecha) === f.anio) &&
      (!f.tipo || d.tipo === f.tipo) &&
      (!f.cuadra || !/^cuadra$/i.test(d.estadoCuadratura)) &&
      coincide(normalizar([String(d.folio), d.proveedor, d.rut, d.referencias, d.contactoPertec, d.comuna].filter(Boolean).join(" | "))),
  );
}

export function filtrarProveedores<P extends ProveedorCompra>(provs: P[], f: { q?: string; categoria?: string }): P[] {
  const coincide = compilarBusqueda(f.q ?? "");
  return provs.filter(
    (p) => (!f.categoria || p.categoriaPrincipal === f.categoria) && coincide(normalizar([p.razonSocial, p.rut, p.giro, p.comuna, p.contactoPertec, p.email].filter(Boolean).join(" | "))),
  );
}

// -----------------------------------------------------------------------------
//  Valorización de un conteo (hoja «Valorización inventario»)
// -----------------------------------------------------------------------------

export interface FilaConteo {
  clave: string;
  /** Lo contado en bodega; null mientras no se escribe. */
  contado: number | null;
  observacion: string;
}

export interface FilaConteoValorizada extends FilaConteo {
  item: ItemCatalogo | null;
  comprado: number;
  /** Comprado − contado: lo consumido, entregado o perdido que hay que explicar. */
  diferencia: number | null;
  participacionDiferencia: number | null;
  /** Contado × último costo (criterio de reposición). */
  valorInventario: number | null;
  /** Diferencia × costo promedio ponderado (criterio contable). */
  valorDiferencia: number | null;
}

export function valorizarConteo(filas: FilaConteo[], catalogo: Map<string, ItemCatalogo>): FilaConteoValorizada[] {
  return filas.map((f) => {
    const item = catalogo.get(f.clave) ?? null;
    const comprado = item?.cantidad ?? 0;
    const diferencia = f.contado === null ? null : comprado - f.contado;
    return {
      ...f,
      item,
      comprado,
      diferencia,
      participacionDiferencia: diferencia === null || comprado === 0 ? null : diferencia / comprado,
      valorInventario: f.contado === null || item?.ultimoCosto == null ? null : f.contado * item.ultimoCosto,
      valorDiferencia: diferencia === null || item?.costoPromedio == null ? null : diferencia * item.costoPromedio,
    };
  });
}

/** Lo escrito en la casilla de conteo: «12», «1,5», «1.500» (miles) o «1.5» (decimal). Vacío o ilegible = sin contar. */
export function leerNumero(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export function totalesConteo(filas: FilaConteoValorizada[]): { contadas: number; valorInventario: number; valorDiferencia: number } {
  return filas.reduce(
    (t, f) => ({
      contadas: t.contadas + (f.contado === null ? 0 : 1),
      valorInventario: t.valorInventario + (f.valorInventario ?? 0),
      valorDiferencia: t.valorDiferencia + (f.valorDiferencia ?? 0),
    }),
    { contadas: 0, valorInventario: 0, valorDiferencia: 0 },
  );
}

// -----------------------------------------------------------------------------
//  CSV (para llevarse un resultado a Excel)
// -----------------------------------------------------------------------------

/** CSV con «;» y BOM, que es como lo abre bien el Excel en español. */
export function aCsv(encabezados: string[], filas: (string | number | null | undefined)[][]): string {
  const celda = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [encabezados, ...filas].map((f) => f.map(celda).join(";")).join("\r\n");
}
