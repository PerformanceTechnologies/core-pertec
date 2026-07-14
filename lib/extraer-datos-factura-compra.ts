import "server-only";

// Extraccion best-effort de campos desde el texto plano de la "representacion
// grafica" del PDF de una factura de compra. A diferencia del XML de venta
// (un solo esquema fijo del SII), cada proveedor genera su propio layout con
// su propio sistema de facturacion -- estos regex cubren los patrones mas
// comunes (headers en español, formato de RUT y monto chileno) pero pueden
// fallar en proveedores con formatos atipicos. texto_extraido sigue siendo
// la fuente de verdad para busqueda; estos campos son solo para mostrar la
// tabla con columnas como la de ventas.

const PATRON_RUT = /\b(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])\b/g;

function normalizarRut(rut: string): string {
  return rut.replace(/\./g, "").toUpperCase();
}

export interface DatosCompraExtraidos {
  folio: number | null;
  tipoDocumentoDetectado: string | null;
  rutEmisor: string | null;
  razonSocialEmisor: string | null;
  fechaEmision: string | null; // YYYY-MM-DD
  montoTotal: number | null;
}

function extraerRutEmisor(texto: string, rutPropioNormalizado: string): string | null {
  const encontrados = [...texto.matchAll(PATRON_RUT)].map((m) => m[1]);
  const distintos = [...new Set(encontrados)];
  const ajenos = distintos.filter((r) => normalizarRut(r) !== rutPropioNormalizado);
  return ajenos[0] ?? null;
}

// Heuristica: la razon social del emisor suele ser la primera linea no vacia
// del documento (asi arman su header casi todos los sistemas de
// facturacion), antes de la linea "Giro:".
function extraerRazonSocialEmisor(texto: string): string | null {
  const lineas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const primera = lineas[0];
  if (!primera || /^giro:/i.test(primera)) return null;
  return primera;
}

function extraerFolio(texto: string): number | null {
  const patrones = [
    /(?:FACTURA|BOLETA|GUIA|NOTA)[^\n]*\n\s*N[°ºo]\.?\s*:?\s*(\d{1,10})/i,
    /Folio\s*:?\s*N?[°ºo]?\.?\s*(\d{1,10})/i,
    /N[°ºo]\.?\s*(\d{2,10})\b/,
  ];
  for (const patron of patrones) {
    const m = texto.match(patron);
    if (m) return Number(m[1]);
  }
  return null;
}

const MESES: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

function parsearFecha(texto: string): string | null {
  const textoNorm = texto.trim();

  // "01 de Febrero del 2026" / "01 de Febrero de 2026"
  const spanish = textoNorm.match(/(\d{1,2})\s+de\s+([a-zA-Záéíóú]+)\s+de[l]?\s+(\d{4})/i);
  if (spanish) {
    const mes = MESES[spanish[2].toLowerCase()];
    if (mes) return `${spanish[3]}-${mes}-${spanish[1].padStart(2, "0")}`;
  }

  // "01/02/2026" o "01-02-2026"
  const numerico = textoNorm.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (numerico) {
    return `${numerico[3]}-${numerico[2].padStart(2, "0")}-${numerico[1].padStart(2, "0")}`;
  }

  // "2026-02-01"
  const iso = textoNorm.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];

  return null;
}

function extraerFechaEmision(texto: string): string | null {
  const m = texto.match(/Fecha\s*(?:de\s*)?Emisi[oó]n\s*:?\s*([^\n]+)/i);
  if (!m) return null;
  return parsearFecha(m[1]);
}

function extraerMontoTotal(texto: string): number | null {
  const m = texto.match(/\bTOTAL\s*\$?\s*([\d.,]+)/i);
  if (!m) return null;
  const limpio = m[1].replace(/\./g, "").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function extraerTipoDocumento(texto: string): string | null {
  const patrones: [RegExp, string][] = [
    [/NOTA\s+DE\s+CR[EÉ]DITO/i, "Nota de Crédito"],
    [/NOTA\s+DE\s+D[EÉ]BITO/i, "Nota de Débito"],
    [/GU[IÍ]A\s+DE\s+DESPACHO/i, "Guía de Despacho"],
    [/BOLETA/i, "Boleta"],
    [/FACTURA/i, "Factura"],
  ];
  for (const [patron, etiqueta] of patrones) {
    if (patron.test(texto)) return etiqueta;
  }
  return null;
}

export function extraerDatosFacturaCompra(texto: string, rutPropio: string): DatosCompraExtraidos {
  const rutPropioNormalizado = normalizarRut(rutPropio);
  return {
    folio: extraerFolio(texto),
    tipoDocumentoDetectado: extraerTipoDocumento(texto),
    rutEmisor: extraerRutEmisor(texto, rutPropioNormalizado),
    razonSocialEmisor: extraerRazonSocialEmisor(texto),
    fechaEmision: extraerFechaEmision(texto),
    montoTotal: extraerMontoTotal(texto),
  };
}
