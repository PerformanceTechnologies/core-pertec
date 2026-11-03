import ExcelJS from "exceljs";
import { sinComentarios } from "./excel-sin-comentarios";
import {
  normalizar,
  type CategoriaCompra,
  type ControlRegistro,
  type DocumentoCompra,
  type Duplicado,
  type FilaUniverso,
  type LineaCompra,
  type ProveedorCompra,
} from "./valorizacion-historica-modelo";

// -----------------------------------------------------------------------------
//  Lectura del «Registro Maestro de Compras» (el Excel de DTE recibidos del SII).
//
//  Se leen los VALORES que el Excel ya calculó (cada fórmula guarda su resultado), no las fórmulas.
//  Las columnas se buscan por su encabezado y no por su letra: si alguien agrega o mueve una
//  columna, se sigue leyendo bien; si falta una que importa, se dice cuál.
//
//  Las hojas que son cálculo puro (Resumen, Buscador, Catálogo, Valorización) no se leen: el Core
//  las rehace desde el detalle con las mismas reglas (ver valorizacion-historica-modelo.ts).
// -----------------------------------------------------------------------------

export interface RegistroLeido {
  lineas: LineaCompra[];
  documentos: DocumentoCompra[];
  proveedores: ProveedorCompra[];
  categorias: CategoriaCompra[];
  control: ControlRegistro;
}

type Celda = ExcelJS.Cell;

function valor(c: Celda | undefined): unknown {
  const v = c?.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return (v as { result: unknown }).result ?? null; // fórmula: su último resultado
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in v) return String((v as ExcelJS.CellHyperlinkValue).text); // hipervínculo
    if ("error" in v) return null;
    return null;
  }
  return v;
}

function texto(c: Celda | undefined): string | null {
  const v = valor(c);
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

function numero(c: Celda | undefined): number | null {
  const v = valor(c);
  if (v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function fecha(c: Celda | undefined): string | null {
  const v = valor(c);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10); // serial de Excel
  const s = typeof v === "string" ? v.trim() : "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const cl = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  return cl ? `${cl[3]}-${cl[2].padStart(2, "0")}-${cl[1].padStart(2, "0")}` : null;
}

/**
 * La ruta del PDF dentro de DTE_SII, a partir del hipervínculo «Ver PDF»
 * («DTE_SII\2022\09%20Septiembre\DTE_R_CODIGO_1.pdf» → «2022/09 Septiembre/DTE_R_CODIGO_1.pdf»).
 */
export function rutaPdfDeVinculo(vinculo: string | null | undefined): string | null {
  if (!vinculo) return null;
  let s = vinculo.replace(/\\/g, "/");
  try {
    s = decodeURIComponent(s);
  } catch {
    /* queda como venía */
  }
  s = s.replace(/^.*?DTE_SII\//i, "").replace(/^\/+/, "");
  return /\.pdf$/i.test(s) ? s : null;
}

function vinculo(c: Celda | undefined): string | null {
  if (!c) return null;
  const v = c.value as ExcelJS.CellHyperlinkValue | null;
  return rutaPdfDeVinculo(c.hyperlink ?? (v && typeof v === "object" && "hyperlink" in v ? v.hyperlink : null));
}

function hoja(libro: ExcelJS.Workbook, nombre: string): ExcelJS.Worksheet {
  const buscado = normalizar(nombre);
  const h = libro.worksheets.find((w) => normalizar(w.name.trim()) === buscado);
  if (!h) throw new Error(`Al Excel le falta la hoja «${nombre}». ¿Es el Registro Maestro de Compras?`);
  return h;
}

/**
 * Ubica la fila de encabezados (la que empieza con «N°» o con el primer encabezado esperado) en las
 * primeras filas y devuelve, para cada encabezado pedido, su número de columna.
 */
function columnas<K extends string>(h: ExcelJS.Worksheet, pedidas: Record<K, string>, primera: string): { fila: number; col: Record<K, number> } {
  const objetivo = normalizar(primera);
  for (let f = 1; f <= 15; f++) {
    const fila = h.getRow(f);
    const encabezados = new Map<string, number>();
    fila.eachCell((c, i) => {
      const t = texto(c);
      if (t) encabezados.set(normalizar(t), i);
    });
    if (!encabezados.has(objetivo)) continue;
    const col = {} as Record<K, number>;
    const faltan: string[] = [];
    for (const [k, nombre] of Object.entries(pedidas) as [K, string][]) {
      const i = encabezados.get(normalizar(nombre));
      if (i === undefined) faltan.push(nombre);
      else col[k] = i;
    }
    if (faltan.length) throw new Error(`En la hoja «${h.name}» faltan las columnas: ${faltan.join(", ")}.`);
    return { fila: f, col };
  }
  throw new Error(`No se encontró la fila de encabezados en la hoja «${h.name}».`);
}

function* filasDatos(h: ExcelJS.Worksheet, desde: number): Generator<ExcelJS.Row> {
  for (let f = desde + 1; f <= h.rowCount; f++) yield h.getRow(f);
}

// ---------- Detalle compras ----------------------------------------------------

const COL_DETALLE = {
  n: "N°",
  fecha: "Fecha",
  tipo: "Tipo documento",
  folio: "Folio",
  rut: "RUT proveedor",
  proveedor: "Proveedor",
  codigo: "Código proveedor",
  glosa: "Glosa (según factura)",
  producto: "Producto",
  marca: "Marca",
  modelo: "Modelo / referencia",
  talla: "Talla",
  categoria: "Categoría",
  subcategoria: "Subcategoría",
  tipoItem: "Tipo de ítem",
  cantidad: "Cantidad",
  unidad: "Unidad",
  precio: "Precio unitario neto",
  desc: "% Desc. línea",
  valorLinea: "Valor neto línea",
  factor: "Factor desc. global",
  valorAjustado: "Valor neto ajustado",
  costo: "Costo unitario neto real",
  cuadratura: "Estado cuadratura",
  revisar: "Revisar",
  pdf: "PDF",
  referencias: "Referencias (OC / guías)",
  clave: "Clave ítem",
};

function leerDetalle(h: ExcelJS.Worksheet): LineaCompra[] {
  const { fila, col } = columnas(h, COL_DETALLE, "N°");
  const lineas: LineaCompra[] = [];
  for (const r of filasDatos(h, fila)) {
    const c = (k: keyof typeof COL_DETALLE) => r.getCell(col[k]);
    const n = numero(c("n"));
    const f = fecha(c("fecha"));
    if (n === null || !f) continue; // filas en blanco o de totales
    const glosa = texto(c("glosa")) ?? "";
    const valorLinea = numero(c("valorLinea")) ?? 0;
    const factor = numero(c("factor")) ?? 1;
    const cant = numero(c("cantidad"));
    // Si la fórmula no trae resultado guardado (archivo nunca abierto en Excel), se rehace igual que ella.
    const valorAjustado = numero(c("valorAjustado")) ?? Math.round(valorLinea * factor);
    const costo = numero(c("costo")) ?? (cant ? valorAjustado / cant : null);
    lineas.push({
      n,
      fecha: f,
      tipoDocumento: texto(c("tipo")) ?? "Factura",
      folio: numero(c("folio")) ?? 0,
      rut: texto(c("rut")) ?? "",
      proveedor: texto(c("proveedor")) ?? "",
      codigoProveedor: texto(c("codigo")),
      glosa,
      producto: texto(c("producto")),
      marca: texto(c("marca")),
      modelo: texto(c("modelo")),
      talla: texto(c("talla")),
      categoria: texto(c("categoria")) ?? "Sin categoría",
      subcategoria: texto(c("subcategoria")) ?? "Sin subcategoría",
      tipoItem: texto(c("tipoItem")) ?? "Por revisar",
      cantidad: cant,
      unidad: texto(c("unidad")),
      precioUnitario: numero(c("precio")),
      descuentoLinea: numero(c("desc")),
      valorLinea,
      factorDescuentoGlobal: factor,
      valorAjustado,
      costoUnitario: costo,
      estadoCuadratura: texto(c("cuadratura")) ?? "",
      revisar: normalizar(texto(c("revisar")) ?? "") === "si",
      pdf: vinculo(c("pdf")),
      referencias: texto(c("referencias"))?.replace(/^-\s*/, "") ?? null,
      clave: texto(c("clave")) ?? glosa.toUpperCase(),
    });
  }
  return lineas;
}

// ---------- Facturas -------------------------------------------------------------

const COL_FACTURAS = {
  n: "N°",
  fecha: "Fecha emisión",
  tipo: "Tipo documento",
  folio: "Folio",
  rut: "RUT proveedor",
  proveedor: "Proveedor",
  direccion: "Dirección proveedor",
  comuna: "Comuna",
  contacto: "Contacto PERTEC en factura",
  neto: "Monto neto",
  exento: "Monto exento",
  iva: "IVA",
  adicional: "Imp. adicional",
  total: "Total documento",
  cuadratura: "Estado cuadratura",
  referencias: "Referencias (OC / guías / doc. anulado)",
  pdf: "PDF",
};

function leerFacturas(h: ExcelJS.Worksheet): DocumentoCompra[] {
  const { fila, col } = columnas(h, COL_FACTURAS, "N°");
  const docs: DocumentoCompra[] = [];
  for (const r of filasDatos(h, fila)) {
    const c = (k: keyof typeof COL_FACTURAS) => r.getCell(col[k]);
    const n = numero(c("n"));
    const f = fecha(c("fecha"));
    if (n === null || !f) continue;
    docs.push({
      n,
      fecha: f,
      tipo: texto(c("tipo")) ?? "Factura",
      folio: numero(c("folio")) ?? 0,
      rut: texto(c("rut")) ?? "",
      proveedor: texto(c("proveedor")) ?? "",
      direccion: texto(c("direccion")),
      comuna: texto(c("comuna")),
      contactoPertec: texto(c("contacto")),
      montoNeto: numero(c("neto")) ?? 0,
      montoExento: numero(c("exento")) ?? 0,
      iva: numero(c("iva")) ?? 0,
      impuestoAdicional: numero(c("adicional")) ?? 0,
      total: numero(c("total")) ?? 0,
      estadoCuadratura: texto(c("cuadratura")) ?? "",
      referencias: texto(c("referencias"))?.replace(/^-\s*/, "") ?? null,
      pdf: vinculo(c("pdf")),
    });
  }
  return docs;
}

// ---------- Proveedores --------------------------------------------------------

const COL_PROVEEDORES = {
  rut: "RUT",
  razon: "Razón social",
  giro: "Giro",
  direccion: "Dirección",
  comuna: "Comuna",
  email: "Email proveedor (si figura en DTE)",
  contacto: "Contacto PERTEC frecuente",
  categoria: "Categoría principal",
};

function leerProveedores(h: ExcelJS.Worksheet): ProveedorCompra[] {
  const { fila, col } = columnas(h, COL_PROVEEDORES, "N°");
  const vistos = new Set<string>();
  const provs: ProveedorCompra[] = [];
  for (const r of filasDatos(h, fila)) {
    const c = (k: keyof typeof COL_PROVEEDORES) => r.getCell(col[k]);
    const rut = texto(c("rut"));
    const razon = texto(c("razon"));
    if (!rut || !razon || vistos.has(rut)) continue;
    vistos.add(rut);
    provs.push({
      rut,
      razonSocial: razon,
      giro: texto(c("giro")),
      direccion: texto(c("direccion")),
      comuna: texto(c("comuna")),
      email: texto(c("email")),
      contactoPertec: texto(c("contacto")),
      categoriaPrincipal: texto(c("categoria")),
    });
  }
  return provs;
}

// ---------- Categorías ---------------------------------------------------------

function leerCategorias(h: ExcelJS.Worksheet): CategoriaCompra[] {
  const { fila, col } = columnas(h, { categoria: "Categoría", subcategoria: "Subcategoría", tipoItem: "Tipo de ítem", criterio: "Criterio / contenido" }, "Categoría");
  const cats: CategoriaCompra[] = [];
  for (const r of filasDatos(h, fila)) {
    const categoria = texto(r.getCell(col.categoria));
    const subcategoria = texto(r.getCell(col.subcategoria));
    if (!categoria || !subcategoria) break; // termina en la fila TOTAL, antes de las listas de filtros
    cats.push({ categoria, subcategoria, tipoItem: texto(r.getCell(col.tipoItem)) ?? "", criterio: texto(r.getCell(col.criterio)), orden: cats.length + 1 });
  }
  return cats;
}

// ---------- Control y observaciones -------------------------------------------------

/**
 * La hoja de control es un informe, no una tabla: se recorre por sus secciones (A, B, C,
 * Metodología, D) mirando el título de cada bloque. Si alguna no está, queda vacía y listo.
 */
function leerControl(h: ExcelJS.Worksheet): ControlRegistro {
  const control: ControlRegistro = { universo: [], porTipo: [], destinos: [], observaciones: [], metodologia: [], duplicados: [] };
  let seccion: "" | "universo" | "porTipo" | "destinos" | "observaciones" | "metodologia" | "duplicados" = "";
  for (let f = 1; f <= h.rowCount; f++) {
    const r = h.getRow(f);
    const a = texto(r.getCell(1));
    if (!a) continue;
    const t = normalizar(a);
    if (/^a\.\s/.test(t)) { seccion = "universo"; continue; }
    if (t.startsWith("documentos de cobro por tipo")) { seccion = "porTipo"; continue; }
    if (/^b\.\s/.test(t)) { seccion = "destinos"; continue; }
    if (/^c\.\s/.test(t)) { seccion = "observaciones"; continue; }
    if (t.startsWith("metodologia")) { seccion = "metodologia"; continue; }
    if (/^d\.\s/.test(t)) { seccion = "duplicados"; continue; }
    if (["concepto", "destino del gasto", "archivo excluido"].includes(t)) continue; // encabezados

    const fila: FilaUniverso = { concepto: a, documentos: numero(r.getCell(2)), monto: numero(r.getCell(3)), tratamiento: texto(r.getCell(6)) };
    switch (seccion) {
      case "universo":
        control.universo.push(fila);
        break;
      case "porTipo":
        control.porTipo.push(fila);
        break;
      case "destinos": {
        if (t.startsWith("total")) break;
        const lineas = numero(r.getCell(2)), m = numero(r.getCell(3));
        if (lineas === null && m === null) break; // la nota al pie
        control.destinos.push({
          destino: a.replace(/^(en alcance|fuera de alcance):\s*/i, ""),
          lineas: lineas ?? 0,
          monto: m ?? 0,
          enAlcance: t.startsWith("en alcance"),
        });
        break;
      }
      case "observaciones": {
        const v = numero(r.getCell(2));
        if (v !== null) control.observaciones.push({ concepto: a, valor: v });
        break;
      }
      case "metodologia":
        control.metodologia.push(a.replace(/^[•\-]\s*/, ""));
        break;
      case "duplicados": {
        const d: Duplicado = {
          archivo: a,
          tipo: texto(r.getCell(2)) ?? "",
          folio: numero(r.getCell(3)),
          rut: texto(r.getCell(4)),
          fecha: fecha(r.getCell(5)),
          proveedor: texto(r.getCell(6)),
        };
        // Las guías emitidas por PERTEC vienen sin RUT: la fecha cae en la columna D.
        if (!d.fecha && !d.rut) d.fecha = fecha(r.getCell(4));
        else if (!d.fecha && d.rut && /^\d{4}-\d{2}-\d{2}$/.test(d.rut)) { d.fecha = d.rut; d.rut = null; }
        control.duplicados.push(d);
        break;
      }
    }
  }
  return control;
}

/** Lee el archivo completo. Lanza un Error con un mensaje para la persona si no es el registro esperado. */
export async function leerRegistroMaestro(contenido: Buffer): Promise<RegistroLeido> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load((await sinComentarios(contenido)) as unknown as ArrayBuffer);
  } catch {
    throw new Error("No se pudo abrir el archivo: tiene que ser el Excel (.xlsx) del Registro Maestro de Compras.");
  }
  const lineas = leerDetalle(hoja(libro, "Detalle compras"));
  const documentos = leerFacturas(hoja(libro, "Facturas"));
  const proveedores = leerProveedores(hoja(libro, "Proveedores"));
  const categorias = leerCategorias(hoja(libro, "Categorías"));
  const hControl = libro.worksheets.find((w) => normalizar(w.name).startsWith("control"));
  const control = hControl ? leerControl(hControl) : { universo: [], porTipo: [], destinos: [], observaciones: [], metodologia: [], duplicados: [] };

  if (lineas.length === 0) throw new Error("La hoja «Detalle compras» no trae líneas.");
  if (documentos.length === 0) throw new Error("La hoja «Facturas» no trae documentos.");
  const ns = new Set<number>();
  for (const l of lineas) {
    if (ns.has(l.n)) throw new Error(`La línea N° ${l.n} de «Detalle compras» está repetida.`);
    ns.add(l.n);
  }
  // Un proveedor que aparece en el detalle pero no en su hoja se agrega con lo que dice la línea.
  const conocidos = new Set(proveedores.map((p) => p.rut));
  for (const l of lineas) {
    if (l.rut && !conocidos.has(l.rut)) {
      conocidos.add(l.rut);
      proveedores.push({ rut: l.rut, razonSocial: l.proveedor, giro: null, direccion: null, comuna: null, email: null, contactoPertec: null, categoriaPrincipal: null });
    }
  }
  return { lineas, documentos, proveedores, categorias, control };
}
