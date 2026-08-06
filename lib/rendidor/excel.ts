import "server-only";
import ExcelJS from "exceljs";
import { CATEGORIAS_GASTO, TRATAMIENTO_DOCUMENTO, type GastoRendicion, type Rendicion } from "./tipos";
import { desgloseDeGasto } from "./iva";

// PASO 4 de la skill rendidor-gastos: la planilla de 2 hojas.
//
// Hoja 1 "Rendición": encabezado, tabla de gastos, cuadro financiero, resumen
// por categoría, resumen tributario y firmas.
// Hoja 2 "Respaldos": una ficha por gasto con la imagen del comprobante embebida.
//
// Los montos van como FÓRMULAS, no como resultados calculados en JS: la planilla
// tiene que recalcular sola cuando el contador corrige una celda. Es la misma
// razón por la que la skill exige openpyxl con formulas.

// Colores exactos de la skill — no variar.
const AZUL_OSCURO = "FF1F3864";
const AZUL_CLARO = "FFD9E1F2";
const GRIS_ALTERNO = "FFF2F2F2";
const AMARILLO_SALDO = "FFFFEB9C";
const BLANCO = "FFFFFFFF";

const FUENTE = "Arial";
const MONEDA = '"$ "#,##0';
// El saldo puede ser negativo (sobra fondo): en paréntesis, como corresponde.
const MONEDA_SIGNO = '"$ "#,##0;("$ "#,##0)';
const PORCENTAJE = "0.0%";

type Relleno = typeof AZUL_OSCURO | typeof AZUL_CLARO | typeof GRIS_ALTERNO | typeof AMARILLO_SALDO;

function pintar(celda: ExcelJS.Cell, color: Relleno) {
  celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

interface EstiloCelda {
  bold?: boolean;
  size?: number;
  color?: string;
  fondo?: Relleno;
  horizontal?: "left" | "center" | "right";
  wrap?: boolean;
  numFmt?: string;
}

function estilar(celda: ExcelJS.Cell, e: EstiloCelda) {
  celda.font = { name: FUENTE, bold: e.bold, size: e.size ?? 11, color: { argb: e.color ?? "FF000000" } };
  if (e.fondo) pintar(celda, e.fondo);
  celda.alignment = { horizontal: e.horizontal, vertical: "middle", wrapText: e.wrap };
  if (e.numFmt) celda.numFmt = e.numFmt;
}

/** Título de sección: barra azul oscuro con texto blanco, sobre un rango combinado. */
function tituloSeccion(hoja: ExcelJS.Worksheet, rango: string, texto: string, size = 11) {
  hoja.mergeCells(rango);
  const celda = hoja.getCell(rango.split(":")[0]);
  celda.value = texto;
  estilar(celda, { bold: true, size, color: BLANCO, fondo: AZUL_OSCURO, horizontal: "center" });
}

/** Fila etiqueta/valor del encabezado: "Empleado:" | Alex Oliva */
function filaEtiqueta(
  hoja: ExcelJS.Worksheet,
  fila: number,
  etiqueta: string,
  valor: string | number,
  opciones: { bold?: boolean; numFmt?: string } = {},
) {
  hoja.mergeCells(`A${fila}:C${fila}`);
  hoja.mergeCells(`D${fila}:L${fila}`);
  estilar(hoja.getCell(`A${fila}`), { bold: true, fondo: AZUL_CLARO, horizontal: "right" });
  hoja.getCell(`A${fila}`).value = etiqueta;
  const v = hoja.getCell(`D${fila}`);
  v.value = valor;
  estilar(v, { bold: opciones.bold, horizontal: "left", numFmt: opciones.numFmt });
}

// ---------------------------------------------------------------------------
// Dimensiones de imagen
//
// Hace falta la proporción real para que la imagen embebida no salga estirada ni
// se pise con la sección siguiente. Se leen del binario en vez de traer una
// dependencia entera solo para esto.

function dimensionesImagen(buffer: Buffer): { ancho: number; alto: number } | null {
  // PNG: IHDR arranca en el byte 16, ancho y alto big-endian de 4 bytes.
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { ancho: buffer.readUInt32BE(16), alto: buffer.readUInt32BE(20) };
  }

  // JPEG: recorrer los marcadores hasta un SOF (0xC0–0xCF, salvo C4/C8/CC).
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    while (i < buffer.length - 9) {
      if (buffer[i] !== 0xff) {
        i++;
        continue;
      }
      const marcador = buffer[i + 1];
      if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
        return { alto: buffer.readUInt16BE(i + 5), ancho: buffer.readUInt16BE(i + 7) };
      }
      i += 2 + buffer.readUInt16BE(i + 2);
    }
  }

  return null;
}

/**
 * Neto e IVA de un gasto para las columnas I y J.
 *
 * Se CALCULAN con las mismas reglas que usa la carga a Odoo, en vez de escribir
 * `gasto.neto` y `gasto.iva` crudos: esos son lo que el modelo leyó del papel, y
 * una boleta de consumo no desglosa nada, asi que venian en 0. La planilla salia
 * con el resumen tributario en cero y toda la rendicion contada como exenta.
 *
 * Si el calculo no se puede hacer (falta el tipo de documento, o el tipo no
 * define la afectacion) se cae a lo leido: es mejor una fila incompleta que una
 * planilla que no se genera.
 */
function netoEIva(g: GastoRendicion): { neto: number; iva: number } {
  try {
    const d = desgloseDeGasto(g);
    return d ? { neto: d.neto, iva: d.iva } : { neto: g.neto, iva: g.iva };
  } catch {
    return { neto: g.neto, iva: g.iva };
  }
}

export interface RespaldoParaExcel {
  gastoId: string;
  nombre: string;
  mimeType: string;
  contenido: Buffer;
}

const ANCHO_IMAGEN = 480;
const ALTO_MAXIMO_IMAGEN = 520;
// Espaciado entre fichas de la hoja Respaldos (la skill fija ~36 filas).
const FILAS_POR_RESPALDO = 36;

/**
 * Construye el libro completo. `respaldos` puede venir incompleto: un gasto sin
 * su archivo genera la ficha igual, con un aviso en la celda de la imagen en vez
 * de dejar el hueco en silencio.
 */
export async function construirLibroRendicion(
  rendicion: Rendicion,
  respaldos: RespaldoParaExcel[],
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Core PERTEC — Rendir Gastos";
  libro.created = new Date();

  const gastos = [...rendicion.gastos].sort((a, b) => a.orden - b.orden);
  const N = gastos.length;

  const hoja = libro.addWorksheet("Rendición");
  const respaldosHoja = libro.addWorksheet("Respaldos");

  // --- Anchos de columna (valores exactos de la skill) ---
  const anchos: Record<string, number> = {
    A: 6, B: 12, C: 34, D: 16, E: 15, F: 26, G: 46, H: 17, I: 14, J: 12, K: 16, L: 17,
  };
  for (const [col, ancho] of Object.entries(anchos)) hoja.getColumn(col).width = ancho;

  // --- Encabezado (filas 1–9) ---
  tituloSeccion(hoja, "A1:L1", "RENDICIÓN DE FONDO POR RENDIR", 14);
  hoja.mergeCells("A2:L2");
  hoja.getCell("A2").value = "Performance Technologies SpA";
  estilar(hoja.getCell("A2"), { bold: true, size: 12, fondo: AZUL_CLARO, horizontal: "center" });

  const fechas = gastos.map((g) => g.fecha).filter((f): f is string => Boolean(f)).sort();
  const periodo = fechas.length > 0 ? `${fechas[0]} al ${fechas[fechas.length - 1]}` : "sin fechas confirmadas";

  filaEtiqueta(hoja, 4, "Empleado:", rendicion.nombreQuienRinde);
  filaEtiqueta(hoja, 5, "Empresa:", "Performance Technologies SpA");
  filaEtiqueta(hoja, 6, "Motivo:", rendicion.tituloRendicion);
  filaEtiqueta(hoja, 7, "Período:", periodo);
  filaEtiqueta(hoja, 8, "Fondo entregado (CLP):", rendicion.montoAsignado, { bold: true, numFmt: MONEDA });
  filaEtiqueta(hoja, 9, "Cantidad de documentos:", `${N} comprobante${N === 1 ? "" : "s"}`);

  // --- Tabla de gastos (encabezados en 11, datos desde 12) ---
  const CABECERAS = [
    "N°", "Fecha", "Proveedor", "RUT", "N° Documento", "Tipo Documento",
    "Detalle del Gasto", "Categoría", "Neto", "IVA", "Total (CLP)", "Respaldo",
  ];
  CABECERAS.forEach((texto, i) => {
    const celda = hoja.getRow(11).getCell(i + 1);
    celda.value = texto;
    estilar(celda, { bold: true, color: BLANCO, fondo: AZUL_OSCURO, horizontal: "center", wrap: true });
  });

  const PRIMERA = 12;
  const ULTIMA = PRIMERA + N - 1;

  gastos.forEach((g, i) => {
    const f = PRIMERA + i;
    const alterna = i % 2 === 0 ? GRIS_ALTERNO : undefined;
    const etiquetaTipo = g.tipoDocumento ? TRATAMIENTO_DOCUMENTO[g.tipoDocumento].etiqueta : "[ilegible]";
    const { neto, iva } = netoEIva(g);

    const columnas: [string, string | number, EstiloCelda][] = [
      ["A", g.orden, { bold: true, horizontal: "center" }],
      ["B", g.fecha ?? "[ilegible]", { horizontal: "center" }],
      ["C", g.proveedor || "[ilegible]", { horizontal: "left" }],
      ["D", g.rutProveedor ?? "[ilegible]", { horizontal: "center" }],
      ["E", g.numeroDocumento ?? "[ilegible]", { horizontal: "center" }],
      ["F", etiquetaTipo, { horizontal: "center", wrap: true }],
      ["G", g.detalle, { horizontal: "left", wrap: true }],
      ["H", g.categoria ?? "[sin categoría]", { horizontal: "center" }],
      ["I", neto, { horizontal: "right", numFmt: MONEDA }],
      ["J", iva, { horizontal: "right", numFmt: MONEDA }],
      ["K", g.total, { bold: true, horizontal: "right", numFmt: MONEDA }],
    ];

    for (const [col, valor, estilo] of columnas) {
      const celda = hoja.getCell(`${col}${f}`);
      celda.value = valor;
      estilar(celda, { ...estilo, fondo: alterna });
    }

    // Hipervínculo a la ficha de la hoja Respaldos. El nombre de hoja lleva
    // tilde, así que va entre comillas simples o el enlace no resuelve.
    const filaFicha = 4 + i * FILAS_POR_RESPALDO;
    const enlace = hoja.getCell(`L${f}`);
    enlace.value = { text: `Ver imagen N° ${g.orden}`, hyperlink: `#'Respaldos'!A${filaFicha}` };
    estilar(enlace, { horizontal: "center", fondo: alterna, color: "FF0563C1" });
  });

  // --- Fila de totales ---
  const FILA_TOTAL = ULTIMA + 1;
  hoja.mergeCells(`A${FILA_TOTAL}:H${FILA_TOTAL}`);
  hoja.getCell(`A${FILA_TOTAL}`).value = "TOTALES";
  estilar(hoja.getCell(`A${FILA_TOTAL}`), {
    bold: true, color: BLANCO, fondo: AZUL_OSCURO, horizontal: "right",
  });
  for (const col of ["I", "J", "K"] as const) {
    const celda = hoja.getCell(`${col}${FILA_TOTAL}`);
    celda.value = { formula: `SUM(${col}${PRIMERA}:${col}${ULTIMA})` };
    estilar(celda, { bold: true, color: BLANCO, fondo: AZUL_OSCURO, horizontal: "right", numFmt: MONEDA });
  }

  // --- Cuadro financiero ---
  const FIN1 = FILA_TOTAL + 2;
  const FIN2 = FIN1 + 1;
  const FIN3 = FIN2 + 1;

  // El signo lo decide el mismo cálculo que hace la planilla, para que la
  // etiqueta y la cifra nunca se contradigan.
  const totalRendido = gastos.reduce((s, g) => s + g.total, 0);
  const saldo = totalRendido - rendicion.montoAsignado;
  const etiquetaSaldo =
    saldo >= 0
      ? `Saldo a favor de ${rendicion.nombreQuienRinde} (a reembolsar):`
      : "Saldo a reintegrar a la empresa:";

  const filasFinancieras: [number, string, string, Relleno][] = [
    [FIN1, "Fondo entregado:", "D8", AZUL_CLARO],
    [FIN2, "Total gastos rendidos:", `K${FILA_TOTAL}`, AZUL_CLARO],
    [FIN3, etiquetaSaldo, `K${FIN2}-K${FIN1}`, AMARILLO_SALDO],
  ];

  for (const [fila, etiqueta, formula, fondo] of filasFinancieras) {
    hoja.mergeCells(`G${fila}:J${fila}`);
    hoja.getCell(`G${fila}`).value = etiqueta;
    estilar(hoja.getCell(`G${fila}`), { bold: true, fondo, horizontal: "right" });
    const celda = hoja.getCell(`K${fila}`);
    celda.value = { formula };
    estilar(celda, {
      bold: true, fondo, horizontal: "right",
      numFmt: fila === FIN3 ? MONEDA_SIGNO : MONEDA,
    });
  }

  // --- Resumen por categoría ---
  const CAT_TITULO = FIN3 + 5;
  tituloSeccion(hoja, `A${CAT_TITULO}:E${CAT_TITULO}`, "RESUMEN POR CATEGORÍA");

  const CAT_CAB = CAT_TITULO + 1;
  hoja.mergeCells(`A${CAT_CAB}:C${CAT_CAB}`);
  const cabecerasCat: [string, string][] = [
    [`A${CAT_CAB}`, "Categoría"],
    [`D${CAT_CAB}`, "Monto (CLP)"],
    [`E${CAT_CAB}`, "% del total"],
  ];
  for (const [ref, texto] of cabecerasCat) {
    hoja.getCell(ref).value = texto;
    estilar(hoja.getCell(ref), { bold: true, fondo: AZUL_CLARO, horizontal: "center" });
  }

  const CAT_PRIMERA = CAT_CAB + 1;
  CATEGORIAS_GASTO.forEach((categoria, i) => {
    const f = CAT_PRIMERA + i;
    const alterna = i % 2 === 0 ? GRIS_ALTERNO : undefined;

    hoja.mergeCells(`A${f}:C${f}`);
    hoja.getCell(`A${f}`).value = categoria;
    estilar(hoja.getCell(`A${f}`), { horizontal: "left", fondo: alterna });

    const monto = hoja.getCell(`D${f}`);
    // El rango de suma es SIEMPRE la columna K (el total impreso), nunca el neto.
    monto.value = {
      formula: `SUMIF($H$${PRIMERA}:$H$${ULTIMA},"${categoria}",$K$${PRIMERA}:$K$${ULTIMA})`,
    };
    estilar(monto, { horizontal: "right", numFmt: MONEDA, fondo: alterna });

    const pct = hoja.getCell(`E${f}`);
    // IFERROR porque una rendición con total 0 dividiría por cero.
    pct.value = { formula: `IFERROR(D${f}/$K$${FILA_TOTAL},0)` };
    estilar(pct, { horizontal: "right", numFmt: PORCENTAJE, fondo: alterna });
  });

  const CAT_ULTIMA = CAT_PRIMERA + CATEGORIAS_GASTO.length - 1;
  const CAT_TOTAL = CAT_ULTIMA + 1;
  hoja.mergeCells(`A${CAT_TOTAL}:C${CAT_TOTAL}`);
  hoja.getCell(`A${CAT_TOTAL}`).value = "TOTAL";
  estilar(hoja.getCell(`A${CAT_TOTAL}`), {
    bold: true, color: BLANCO, fondo: AZUL_OSCURO, horizontal: "right",
  });
  const totalCat = hoja.getCell(`D${CAT_TOTAL}`);
  totalCat.value = { formula: `SUM(D${CAT_PRIMERA}:D${CAT_ULTIMA})` };
  estilar(totalCat, { bold: true, color: BLANCO, fondo: AZUL_OSCURO, horizontal: "right", numFmt: MONEDA });
  const totalPct = hoja.getCell(`E${CAT_TOTAL}`);
  totalPct.value = { formula: `SUM(E${CAT_PRIMERA}:E${CAT_ULTIMA})` };
  estilar(totalPct, { bold: true, color: BLANCO, fondo: AZUL_OSCURO, horizontal: "right", numFmt: PORCENTAJE });

  // --- Resumen tributario ---
  const TRIB_TITULO = CAT_TOTAL + 2;
  tituloSeccion(hoja, `A${TRIB_TITULO}:E${TRIB_TITULO}`, "RESUMEN TRIBUTARIO");

  const TRIB_CAB = TRIB_TITULO + 1;
  hoja.mergeCells(`A${TRIB_CAB}:C${TRIB_CAB}`);
  hoja.getCell(`A${TRIB_CAB}`).value = "Concepto";
  estilar(hoja.getCell(`A${TRIB_CAB}`), { bold: true, fondo: AZUL_CLARO, horizontal: "center" });
  hoja.getCell(`D${TRIB_CAB}`).value = "Monto (CLP)";
  estilar(hoja.getCell(`D${TRIB_CAB}`), { bold: true, fondo: AZUL_CLARO, horizontal: "center" });

  const filasTrib: [string, string][] = [
    ["Total afecto a IVA (neto)", `SUM(I${PRIMERA}:I${ULTIMA})`],
    ["IVA total", `SUM(J${PRIMERA}:J${ULTIMA})`],
    ["Total exento", `SUMIF($J$${PRIMERA}:$J$${ULTIMA},0,$K$${PRIMERA}:$K$${ULTIMA})`],
    // TOTAL RENDICIÓN es la plata que puso la persona: el total impreso.
    ["TOTAL RENDICIÓN (lo pagado)", `K${FILA_TOTAL}`],
    // Y este es el monto contable, que puede ser MAYOR. En un pasaje aéreo el
    // IVA se agrega sobre el monto impreso, así que neto + IVA supera lo pagado
    // y la resta de las dos filas es justamente el IVA agregado. Sin esta fila la
    // planilla parece descuadrada y no hay con qué conciliar contra Odoo.
    ["TOTAL RECONOCIDO EN ODOO (neto + IVA)", `SUM(I${PRIMERA}:I${ULTIMA})+SUM(J${PRIMERA}:J${ULTIMA})`],
  ];

  filasTrib.forEach(([concepto, formula], i) => {
    const f = TRIB_CAB + 1 + i;
    const ultima = i === filasTrib.length - 1;
    const alterna = ultima ? undefined : i % 2 === 0 ? GRIS_ALTERNO : undefined;

    hoja.mergeCells(`A${f}:C${f}`);
    hoja.getCell(`A${f}`).value = concepto;
    estilar(hoja.getCell(`A${f}`), {
      bold: ultima, horizontal: "left",
      fondo: ultima ? AZUL_CLARO : alterna,
    });

    const monto = hoja.getCell(`D${f}`);
    monto.value = { formula };
    estilar(monto, {
      bold: ultima, horizontal: "right", numFmt: MONEDA,
      fondo: ultima ? AZUL_CLARO : alterna,
    });
  });

  // --- Firmas ---
  const FIRMA_LINEA = TRIB_CAB + filasTrib.length + 3;
  const firmas: [number, string, string, boolean][] = [
    [FIRMA_LINEA, "________________________________", "________________________________", false],
    [FIRMA_LINEA + 1, rendicion.nombreQuienRinde, "Recibido conforme", true],
    [FIRMA_LINEA + 2, "Rinde", "Performance Technologies SpA", false],
  ];
  for (const [fila, izquierda, derecha, bold] of firmas) {
    hoja.mergeCells(`A${fila}:F${fila}`);
    hoja.mergeCells(`G${fila}:L${fila}`);
    hoja.getCell(`A${fila}`).value = izquierda;
    hoja.getCell(`G${fila}`).value = derecha;
    estilar(hoja.getCell(`A${fila}`), { bold, horizontal: "center" });
    estilar(hoja.getCell(`G${fila}`), { bold, horizontal: "center" });
  }

  hoja.getRow(11).height = 30;

  // -------------------------------------------------------------------------
  // Hoja 2: Respaldos
  // -------------------------------------------------------------------------
  const anchosRespaldos: Record<string, number> = { A: 20, B: 38, C: 16, D: 16, E: 16, F: 16 };
  for (const [col, ancho] of Object.entries(anchosRespaldos)) respaldosHoja.getColumn(col).width = ancho;

  tituloSeccion(respaldosHoja, "A1:F1", "RESPALDOS DE GASTOS — IMÁGENES DE BOLETAS Y FACTURAS");
  respaldosHoja.mergeCells("A2:F2");
  respaldosHoja.getCell("A2").value = "Cada sección muestra los datos del comprobante y su imagen original.";
  estilar(respaldosHoja.getCell("A2"), { fondo: AZUL_CLARO, horizontal: "center" });

  const faltantes: string[] = [];

  gastos.forEach((g, i) => {
    const base = 4 + i * FILAS_POR_RESPALDO;
    const etiquetaTipo = g.tipoDocumento ? TRATAMIENTO_DOCUMENTO[g.tipoDocumento].etiqueta : "[ilegible]";
    const { neto, iva } = netoEIva(g);

    tituloSeccion(respaldosHoja, `A${base}:F${base}`, `GASTO N° ${g.orden}`);

    const campos: [string, string | number, string | undefined][] = [
      ["Fecha:", g.fecha ?? "[ilegible]", undefined],
      ["Proveedor:", g.proveedor || "[ilegible]", undefined],
      ["RUT proveedor:", g.rutProveedor ?? "[ilegible]", undefined],
      ["N° Documento:", g.numeroDocumento ?? "[ilegible]", undefined],
      ["Tipo Documento:", etiquetaTipo, undefined],
      ["Detalle:", g.detalle, undefined],
      ["Categoría:", g.categoria ?? "[sin categoría]", undefined],
      ["Neto:", neto, MONEDA],
      ["IVA:", iva, MONEDA],
      ["Total (CLP):", g.total, MONEDA],
    ];

    campos.forEach(([etiqueta, valor, numFmt], j) => {
      const f = base + 1 + j;
      respaldosHoja.getCell(`A${f}`).value = etiqueta;
      estilar(respaldosHoja.getCell(`A${f}`), { bold: true, fondo: AZUL_CLARO, horizontal: "right" });
      respaldosHoja.mergeCells(`B${f}:F${f}`);
      const celda = respaldosHoja.getCell(`B${f}`);
      celda.value = valor;
      estilar(celda, { horizontal: "left", wrap: true, numFmt, bold: etiqueta === "Total (CLP):" });
    });

    const filaVolver = base + 11;
    respaldosHoja.mergeCells(`A${filaVolver}:F${filaVolver}`);
    const volver = respaldosHoja.getCell(`A${filaVolver}`);
    volver.value = { text: "← Volver a la Rendición", hyperlink: "#'Rendición'!A1" };
    estilar(volver, { horizontal: "center", color: "FF0563C1" });

    // --- Imagen embebida ---
    const filaImagen = base + 12;
    const respaldo = respaldos.find((r) => r.gastoId === g.id);

    if (!respaldo) {
      const celda = respaldosHoja.getCell(`A${filaImagen}`);
      respaldosHoja.mergeCells(`A${filaImagen}:F${filaImagen}`);
      celda.value = `⚠ Sin imagen de respaldo para "${g.archivoNombre || "este gasto"}". Hay que adjuntarla a mano.`;
      estilar(celda, { horizontal: "left", fondo: AMARILLO_SALDO, wrap: true });
      faltantes.push(`Gasto ${g.orden}`);
      return;
    }

    if (respaldo.mimeType === "application/pdf") {
      const celda = respaldosHoja.getCell(`A${filaImagen}`);
      respaldosHoja.mergeCells(`A${filaImagen}:F${filaImagen}`);
      celda.value = `📄 El respaldo es un PDF ("${respaldo.nombre}") y no se puede embeber en Excel. Está adjunto al gasto en Odoo.`;
      estilar(celda, { horizontal: "left", fondo: AMARILLO_SALDO, wrap: true });
      return;
    }

    const dims = dimensionesImagen(respaldo.contenido);
    const alto = dims
      ? Math.min(ALTO_MAXIMO_IMAGEN, Math.round((ANCHO_IMAGEN * dims.alto) / dims.ancho))
      : 360;
    const ancho = dims && alto === ALTO_MAXIMO_IMAGEN
      ? Math.round((ALTO_MAXIMO_IMAGEN * dims.ancho) / dims.alto)
      : ANCHO_IMAGEN;

    const idImagen = libro.addImage({
      buffer: respaldo.contenido as unknown as ExcelJS.Buffer,
      extension: respaldo.mimeType === "image/png" ? "png" : "jpeg",
    });
    respaldosHoja.addImage(idImagen, {
      tl: { col: 0, row: filaImagen - 1 },
      ext: { width: ancho, height: alto },
    });
    // La fila del ancla se alarga a la medida de la imagen (px → pt) para que no
    // se pise con la ficha del gasto siguiente.
    respaldosHoja.getRow(filaImagen).height = Math.round(alto * 0.75);
  });

  if (faltantes.length > 0) {
    console.warn(`[rendidor] Excel generado sin imagen para: ${faltantes.join(", ")}`);
  }

  const bytes = await libro.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

/** rendicion_operacion-antucoya_2026-08-05.xlsx */
export function nombreArchivoRendicion(rendicion: Rendicion): string {
  const DIACRITICOS = /[̀-ͯ]/g;
  const limpio = rendicion.tituloRendicion
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60);
  const hoy = new Date().toISOString().slice(0, 10);
  return `rendicion_${limpio || "sin-titulo"}_${hoy}.xlsx`;
}
