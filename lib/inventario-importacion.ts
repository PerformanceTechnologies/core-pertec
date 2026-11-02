import "server-only";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { supabaseAdmin } from "./supabase-admin";
import { ajustarInventario, crearLote, guardarRegla, listarAlmacenes, listarUbicaciones } from "./inventario";
import {
  COLUMNAS_IMPORTACION,
  MAX_FILAS_IMPORTACION,
  mapearEncabezados,
  normalizar,
  revisarDuplicados,
  revisarMapeo,
  sugerirMapeo,
  validarFila,
  type CatalogosImportacion,
  type ClaveColumna,
  type FilaImportacion,
  type OpcionesImportacion,
} from "./inventario-importacion-modelo";
import type { Seguimiento } from "./inventario-modelo";

// -----------------------------------------------------------------------------
//  Carga masiva del Inventario (solo servidor): leer la planilla, armar la vista
//  previa, importar y generar la plantilla.
//
//  No revisa permisos: la ruta /api/inventario/importar exige la app antes.
// -----------------------------------------------------------------------------

// ---------- Leer el archivo --------------------------------------------------

function textoDeCelda(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === "object") {
    if ("result" in valor) return textoDeCelda(valor.result as ExcelJS.CellValue); // fórmula
    if ("richText" in valor) return valor.richText.map((t) => t.text).join("");
    if ("text" in valor) return String(valor.text); // hipervínculo
    return "";
  }
  return String(valor);
}

/** Un CSV de Excel en español viene con «;»; el de otros programas con «,». Respeta comillas. */
function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primera.match(/;/g)?.length ?? 0) >= (primera.match(/,/g)?.length ?? 0) ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda); filas.push(fila); fila = []; celda = "";
    } else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

/**
 * Quita los comentarios (las «notas» de las celdas) antes de abrir el Excel.
 *
 * ExcelJS se cae con «Cannot read properties of undefined (reading 'comments')» cuando
 * el archivo los guardó otro programa con la ruta escrita de otra forma (openpyxl,
 * Google Sheets, algunas versiones de Excel). Para importar no se necesitan: se sacan
 * las relaciones de comentarios y dibujos VML de cada hoja y el resto queda igual.
 */
async function sinComentarios(contenido: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(contenido);
  const tareas: Promise<void>[] = [];
  zip.forEach((ruta, archivo) => {
    if (/^xl\/worksheets\/_rels\/[^/]+\.rels$/.test(ruta)) {
      tareas.push(
        archivo.async("string").then((xml) => {
          zip.file(ruta, xml.replace(/<Relationship\b[^>]*Type="[^"]*\/(comments|vmlDrawing)"[^>]*\/>/g, ""));
        }),
      );
    } else if (/^xl\/worksheets\/[^/]+\.xml$/.test(ruta)) {
      tareas.push(
        archivo.async("string").then((xml) => {
          zip.file(ruta, xml.replace(/<legacyDrawing\b[^>]*\/>/g, ""));
        }),
      );
    }
  });
  await Promise.all(tareas);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function leerFilas(contenido: Buffer, nombreArchivo: string): Promise<string[][]> {
  if (/\.csv$/i.test(nombreArchivo)) return leerCsv(contenido.toString("utf8"));
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load((await sinComentarios(contenido)) as unknown as ArrayBuffer);
  const hoja = libro.getWorksheet("Productos") ?? libro.worksheets[0];
  if (!hoja) return [];
  const filas: string[][] = [];
  hoja.eachRow({ includeEmpty: true }, (fila) => {
    const valores = fila.values as ExcelJS.CellValue[]; // índice 0 vacío: las columnas parten en 1
    filas[fila.number - 1] = valores.slice(1).map(textoDeCelda);
  });
  return Array.from(filas, (f) => f ?? []);
}

// ---------- Catálogos --------------------------------------------------------

async function cargarCatalogos(): Promise<CatalogosImportacion> {
  const [{ data: productos }, ubicaciones, almacenes, { data: cats }, { data: unis }] = await Promise.all([
    supabaseAdmin.from("inv_productos").select("id, sku, nombre, seguimiento").eq("activo", true),
    listarUbicaciones(),
    listarAlmacenes(),
    supabaseAdmin.from("inv_categorias").select("nombre"),
    supabaseAdmin.from("inv_unidades").select("nombre, abreviacion"),
  ]);
  const categorias = new Set((cats ?? []).map((c) => normalizar(c.nombre as string)));
  const unidades = new Set((unis ?? []).flatMap((u) => [normalizar(u.nombre as string), normalizar(u.abreviacion as string)]));
  const productosPorSku = new Map<string, { id: string; seguimiento: Seguimiento }>();
  const productosPorNombre = new Map<string, { id: string; seguimiento: Seguimiento }>();
  for (const p of productos ?? []) {
    const v = { id: p.id as string, seguimiento: p.seguimiento as Seguimiento };
    if (p.sku) productosPorSku.set(normalizar(p.sku), v);
    productosPorNombre.set(normalizar(p.nombre), v);
  }

  // Una bodega se puede nombrar por su ubicación interna (nombre o código) o por el
  // almacén (nombre o código), y en ese caso el stock va a su ubicación principal.
  const internas = ubicaciones.filter((u) => u.tipo === "interna");
  const bodegas = new Map<string, string>();
  for (const a of almacenes) {
    const destino = internas.find((u) => u.almacenId === a.id && u.esStockPrincipal) ?? internas.find((u) => u.almacenId === a.id);
    if (!destino) continue;
    bodegas.set(normalizar(a.nombre), destino.id);
    bodegas.set(normalizar(a.codigo), destino.id);
  }
  for (const u of internas) {
    bodegas.set(normalizar(u.nombre), u.id);
    if (u.codigo) bodegas.set(normalizar(u.codigo), u.id);
  }
  return { productosPorSku, productosPorNombre, bodegas, categorias, unidades };
}

// ---------- Vista previa -----------------------------------------------------

export interface Previsualizacion {
  filas: FilaImportacion[];
  /** Columnas obligatorias que no se encontraron en el encabezado. */
  faltan: string[];
  /** Columnas del archivo que se reconocieron. */
  reconocidas: string[];
  /** Encabezados que no corresponden a ninguna columna (se ignoran). */
  ignoradas: string[];
}

/**
 * La fila de encabezados: la primera que tiene una columna reconocible como «Nombre» (la
 * plantilla puede traer un título encima) o, si ninguna, la primera con datos.
 */
function filaDeEncabezado(filas: string[][]): number {
  const i = filas.findIndex((f) => mapearEncabezados(f).faltan.length === 0);
  return i >= 0 ? i : filas.findIndex((f) => f.some((c) => c.trim() !== ""));
}

export interface ColumnasDelArchivo {
  /** Los títulos de cada columna del archivo. */
  encabezados: string[];
  /** Hasta 3 valores de ejemplo por columna, como la pantalla de Odoo. */
  ejemplos: string[][];
  /** El campo propuesto para cada columna (null = no importar). */
  sugerido: (ClaveColumna | null)[];
  totalFilas: number;
}

/** Paso 1 de Odoo: leer las columnas del archivo y proponer a qué campo va cada una. */
export async function leerColumnas(contenido: Buffer, nombreArchivo: string): Promise<ColumnasDelArchivo> {
  const filas = await leerFilas(contenido, nombreArchivo);
  const iEnc = filaDeEncabezado(filas);
  if (iEnc < 0) return { encabezados: [], ejemplos: [], sugerido: [], totalFilas: 0 };
  const datos = filas.slice(iEnc + 1).filter((f) => f.some((c) => c.trim() !== ""));
  const ancho = Math.max(filas[iEnc].length, ...datos.slice(0, 50).map((f) => f.length));
  const encabezados = Array.from({ length: ancho }, (_, i) => (filas[iEnc][i] ?? "").trim() || `Columna ${i + 1}`);
  return {
    encabezados,
    ejemplos: encabezados.map((_, i) => datos.map((f) => (f[i] ?? "").trim()).filter(Boolean).slice(0, 3)),
    sugerido: sugerirMapeo(filas[iEnc]).concat(Array(Math.max(0, ancho - filas[iEnc].length)).fill(null)),
    totalFilas: datos.length,
  };
}

export async function previsualizar(
  contenido: Buffer,
  nombreArchivo: string,
  mapeo?: (ClaveColumna | null)[],
  opciones: OpcionesImportacion = { crearFaltantes: true },
): Promise<Previsualizacion> {
  const filas = await leerFilas(contenido, nombreArchivo);
  const iEnc = filaDeEncabezado(filas);
  const faltanTodas = COLUMNAS_IMPORTACION.filter((c) => c.obligatoria).map((c) => c.titulo);
  if (iEnc < 0) return { filas: [], faltan: faltanTodas, reconocidas: [], ignoradas: [] };
  const encabezados = filas[iEnc];

  // Con mapeo elegido en pantalla manda ese; sin él, el que se deduce de los títulos.
  const mapa = new Map<number, ClaveColumna>();
  if (mapeo) {
    const problemas = revisarMapeo(mapeo);
    if (problemas.length) throw new Error(`[inventario] ${problemas.join(" ")}`);
    mapeo.forEach((c, i) => c && mapa.set(i, c));
  } else {
    const deducido = mapearEncabezados(encabezados);
    if (deducido.faltan.length) return { filas: [], faltan: deducido.faltan, reconocidas: [], ignoradas: [] };
    deducido.mapa.forEach((c, i) => mapa.set(i, c));
  }
  const catalogos = await cargarCatalogos();

  const datos = filas
    .slice(iEnc + 1)
    .map((f, i) => ({ celdas: f, numero: iEnc + i + 2 }))
    .filter(({ celdas }) => celdas.some((c) => c.trim() !== ""))
    .slice(0, MAX_FILAS_IMPORTACION);

  const validadas = datos.map(({ celdas, numero }) => {
    const porClave: Partial<Record<ClaveColumna, string>> = {};
    mapa.forEach((clave, i) => (porClave[clave] = celdas[i] ?? ""));
    return validarFila(numero, porClave, catalogos, opciones);
  });

  return {
    filas: revisarDuplicados(validadas),
    faltan: [],
    reconocidas: [...mapa.values()].map((c) => COLUMNAS_IMPORTACION.find((x) => x.clave === c)!.titulo),
    ignoradas: encabezados.filter((h, i) => h.trim() && !mapa.has(i)),
  };
}

// ---------- Importar ---------------------------------------------------------

export interface ResultadoImportacion {
  creados: number;
  actualizados: number;
  ajustes: number;
  reglas: number;
  /** Filas que no se importaron, con el motivo (las con errores de validación y las que fallaron al guardar). */
  fallidas: { numero: number; nombre: string; error: string }[];
}

/**
 * Importa las filas válidas, una por una y en orden. No es todo o nada: si una falla, se
 * anota y se sigue con la siguiente. Cada cantidad entra como AJUSTE de inventario (queda
 * su documento y su movimiento, igual que un conteo hecho a mano).
 */
export async function importar(
  contenido: Buffer,
  nombreArchivo: string,
  correo: string,
  mapeo?: (ClaveColumna | null)[],
  opciones: OpcionesImportacion = { crearFaltantes: true },
): Promise<ResultadoImportacion> {
  const { filas, faltan } = await previsualizar(contenido, nombreArchivo, mapeo, opciones);
  if (faltan.length) throw new Error(`[inventario] Falta la columna obligatoria: ${faltan.join(", ")}.`);

  const r: ResultadoImportacion = { creados: 0, actualizados: 0, ajustes: 0, reglas: 0, fallidas: [] };

  const [{ data: cats }, { data: unis }] = await Promise.all([
    supabaseAdmin.from("inv_categorias").select("id, nombre"),
    supabaseAdmin.from("inv_unidades").select("id, nombre, abreviacion"),
  ]);
  const categorias = new Map((cats ?? []).map((c) => [normalizar(c.nombre), c.id as string]));
  const unidades = new Map<string, string>();
  for (const u of unis ?? []) {
    unidades.set(normalizar(u.nombre), u.id);
    unidades.set(normalizar(u.abreviacion), u.id);
  }
  // Productos creados en esta misma carga, para que una segunda fila los encuentre.
  const creadosAqui = new Map<string, string>();

  for (const f of filas) {
    if (f.errores.length) {
      r.fallidas.push({ numero: f.numero, nombre: f.nombre || "(sin nombre)", error: f.errores.join(" ") });
      continue;
    }
    try {
      let categoriaId: string | undefined;
      if (f.categoria) {
        categoriaId = categorias.get(normalizar(f.categoria));
        if (!categoriaId) {
          const { data, error } = await supabaseAdmin.from("inv_categorias").insert({ nombre: f.categoria }).select("id").single();
          if (error) throw new Error(`no se pudo crear la categoría: ${error.message}`);
          categoriaId = data.id as string;
          categorias.set(normalizar(f.categoria), categoriaId);
        }
      }
      let unidadId: string | undefined;
      if (f.unidad) {
        unidadId = unidades.get(normalizar(f.unidad));
        if (!unidadId) {
          const { data, error } = await supabaseAdmin
            .from("inv_unidades").insert({ nombre: f.unidad, abreviacion: f.unidad.slice(0, 10) }).select("id").single();
          if (error) throw new Error(`no se pudo crear la unidad: ${error.message}`);
          unidadId = data.id as string;
          unidades.set(normalizar(f.unidad), unidadId);
        }
      }

      // Solo se escriben las celdas que vienen llenas: una columna vacía no borra lo que había.
      const campos: Record<string, unknown> = {};
      if (f.sku) campos.sku = f.sku;
      if (categoriaId) campos.categoria_id = categoriaId;
      if (unidadId) campos.unidad_id = unidadId;
      if (f.tipo) campos.tipo = f.tipo;
      if (f.seguimiento) campos.seguimiento = f.seguimiento;
      if (f.costo !== null) campos.costo = f.costo;
      if (f.precio !== null) campos.precio = f.precio;
      if (f.descripcion) campos.descripcion = f.descripcion;

      const clave = f.sku ? `sku:${normalizar(f.sku)}` : `nom:${normalizar(f.nombre)}`;
      let productoId = f.productoId ?? creadosAqui.get(clave) ?? null;
      if (productoId) {
        if (Object.keys(campos).length) {
          const { error } = await supabaseAdmin
            .from("inv_productos").update({ ...campos, actualizado_en: new Date().toISOString() }).eq("id", productoId);
          if (error) throw new Error(`no se pudo actualizar el producto: ${error.message}`);
        }
        r.actualizados++;
      } else {
        const { data, error } = await supabaseAdmin
          .from("inv_productos").insert({ nombre: f.nombre, tipo: "almacenable", seguimiento: "ninguno", ...campos }).select("id").single();
        if (error) throw new Error(`no se pudo crear el producto: ${error.message}`);
        productoId = data.id as string;
        creadosAqui.set(clave, productoId);
        r.creados++;
      }

      if (f.ubicacionId && f.cantidad !== null) {
        let loteId: string | null = null;
        if (f.lote) {
          const { data: lote } = await supabaseAdmin
            .from("inv_lotes").select("id").eq("producto_id", productoId).eq("nombre", f.lote).maybeSingle();
          loteId = (lote?.id as string | undefined) ?? (await crearLote(productoId, f.lote, f.vencimiento));
        }
        try {
          const ajuste = await ajustarInventario({ productoId, ubicacionId: f.ubicacionId, loteId, cantidadContada: f.cantidad, creadoPor: correo });
          if (ajuste) r.ajustes++;
        } catch (e) {
          // El producto ya quedó guardado: se dice así, para que se sepa que basta con volver a subir el archivo.
          const motivo = e instanceof Error ? e.message.replace(/^\[inventario\]\s*/, "") : "error inesperado";
          throw new Error(`el producto quedó guardado, pero no se cargó su stock (${motivo}). Al corregirlo, vuelve a subir el archivo: la cantidad no se duplica.`);
        }
      }
      if (f.ubicacionId && (f.minimo !== null || f.maximo !== null)) {
        await guardarRegla({ productoId, ubicacionId: f.ubicacionId, minimo: f.minimo ?? 0, maximo: f.maximo ?? f.minimo ?? 0 });
        r.reglas++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message.replace(/^\[inventario\]\s*/, "") : "error inesperado";
      r.fallidas.push({ numero: f.numero, nombre: f.nombre, error: msg });
    }
  }
  return r;
}

// ---------- Plantilla --------------------------------------------------------

/** La planilla para llenar: hoja Productos (con listas desplegables), Instrucciones y Listas. */
export async function plantilla(): Promise<Buffer> {
  const [ubicaciones, almacenes, { data: cats }, { data: unis }] = await Promise.all([
    listarUbicaciones(),
    listarAlmacenes(),
    supabaseAdmin.from("inv_categorias").select("nombre").order("nombre"),
    supabaseAdmin.from("inv_unidades").select("abreviacion").eq("activo", true).order("abreviacion"),
  ]);
  const bodegas = [
    ...almacenes.map((a) => a.codigo),
    ...ubicaciones.filter((u) => u.tipo === "interna").map((u) => u.nombre),
  ];

  const libro = new ExcelJS.Workbook();
  libro.creator = "Core PERTEC";

  const hoja = libro.addWorksheet("Productos", { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = COLUMNAS_IMPORTACION.map((c) => ({ header: c.obligatoria ? `${c.titulo} *` : c.titulo, key: c.clave, width: Math.max(14, c.titulo.length + 4) }));
  const enc = hoja.getRow(1);
  enc.font = { bold: true, color: { argb: "FFFFFFFF" } };
  enc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC85217" } };
  enc.height = 22;
  COLUMNAS_IMPORTACION.forEach((c, i) => (hoja.getCell(1, i + 1).note = c.ayuda));
  hoja.addRow(Object.fromEntries(COLUMNAS_IMPORTACION.map((c) => [c.clave, c.ejemplo])));
  hoja.getRow(2).font = { italic: true, color: { argb: "FF8C8578" } };

  const listas = libro.addWorksheet("Listas");
  const escribirLista = (col: number, titulo: string, valores: string[]) => {
    listas.getCell(1, col).value = titulo;
    listas.getCell(1, col).font = { bold: true };
    valores.forEach((v, i) => (listas.getCell(i + 2, col).value = v));
    return `Listas!$${String.fromCharCode(64 + col)}$2:$${String.fromCharCode(64 + col)}$${Math.max(2, valores.length + 1)}`;
  };
  const rTipo = escribirLista(1, "Tipo", ["Almacenable", "Consumible", "Servicio"]);
  const rSeg = escribirLista(2, "Seguimiento", ["Ninguno", "Lote", "Serie"]);
  const rBod = escribirLista(3, "Bodega / Ubicación", bodegas);
  escribirLista(4, "Categorías existentes", (cats ?? []).map((c) => c.nombre as string));
  escribirLista(5, "Unidades existentes", (unis ?? []).map((u) => u.abreviacion as string));
  listas.columns.forEach((c) => (c.width = 28));

  const colDe = (clave: ClaveColumna) => COLUMNAS_IMPORTACION.findIndex((c) => c.clave === clave) + 1;
  for (let fila = 2; fila <= MAX_FILAS_IMPORTACION + 1; fila++) {
    hoja.getCell(fila, colDe("tipo")).dataValidation = { type: "list", allowBlank: true, formulae: [rTipo] };
    hoja.getCell(fila, colDe("seguimiento")).dataValidation = { type: "list", allowBlank: true, formulae: [rSeg] };
    if (bodegas.length) {
      hoja.getCell(fila, colDe("bodega")).dataValidation = {
        type: "list", allowBlank: true, formulae: [rBod], showErrorMessage: true,
        errorTitle: "Bodega", error: "Elige una bodega de la lista (créala antes en el Core si no está).",
      };
    }
  }

  const inst = libro.addWorksheet("Instrucciones");
  inst.columns = [{ width: 24 }, { width: 90 }];
  inst.addRow(["Carga masiva de Inventario — Core PERTEC"]).font = { bold: true, size: 14 };
  inst.addRow([]);
  for (const linea of [
    "Llena la hoja «Productos», una fila por producto (y por bodega/lote si cargas stock). Borra la fila de ejemplo.",
    "Solo «Nombre» es obligatorio. Las celdas vacías NO borran lo que el producto ya tenía.",
    "Si el SKU ya existe se actualiza ese producto; si no hay SKU, se busca por nombre exacto. Si no existe, se crea.",
    "«Cantidad» es el stock que hay HOY en esa bodega: el sistema hace un ajuste por la diferencia (no suma).",
    "Las bodegas deben existir en el Core. Categorías y unidades nuevas se crean solas.",
    `Hasta ${MAX_FILAS_IMPORTACION} filas por archivo. También se acepta CSV con los mismos encabezados.`,
    "Antes de importar, el Core muestra una vista previa con lo que va a crear, actualizar y los errores por fila.",
  ]) inst.addRow(["•", linea]).alignment = { wrapText: true, vertical: "top" };
  inst.addRow([]);
  inst.addRow(["Columna", "Qué va"]).font = { bold: true };
  for (const c of COLUMNAS_IMPORTACION) inst.addRow([c.obligatoria ? `${c.titulo} *` : c.titulo, `${c.ayuda} Ej.: ${c.ejemplo}`]).alignment = { wrapText: true, vertical: "top" };

  return Buffer.from(await libro.xlsx.writeBuffer());
}
