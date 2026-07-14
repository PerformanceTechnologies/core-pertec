// Utilidad de mantenimiento: re-extrae folio/RUT/razon social/fecha/monto
// desde el texto_extraido ya guardado en facturas_compra_historico, sin
// volver a descargar los PDF de SharePoint. Util despues de ajustar los
// regex de lib/extraer-datos-factura-compra.ts (logica duplicada aqui a
// proposito, igual que scripts/explorar-rcv.mjs: este script corre fuera
// del build de Next, sin pasar por TypeScript).
//
// Uso: node scripts/reextraer-facturas-compra.mjs
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rutPropio = (process.env.SII_RUT_EMPRESA ?? "77590967-6").replace(/\./g, "").toUpperCase();

if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const PATRON_RUT = /\b(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])\b/g;

function normalizarRut(rut) {
  return rut.replace(/\./g, "").toUpperCase();
}

function extraerRutEmisor(texto) {
  const encontrados = [...texto.matchAll(PATRON_RUT)].map((m) => m[1]);
  const distintos = [...new Set(encontrados)];
  return distintos.filter((r) => normalizarRut(r) !== rutPropio)[0] ?? null;
}

function extraerRazonSocialEmisor(texto) {
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const primera = lineas[0];
  if (!primera || /^giro:/i.test(primera)) return null;
  return primera;
}

function extraerFolio(texto) {
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

const MESES = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10",
  noviembre: "11", diciembre: "12",
};

function parsearFecha(texto) {
  const t = texto.trim();
  const spanish = t.match(/(\d{1,2})\s+de\s+([a-zA-Záéíóú]+)\s+de[l]?\s+(\d{4})/i);
  if (spanish) {
    const mes = MESES[spanish[2].toLowerCase()];
    if (mes) return `${spanish[3]}-${mes}-${spanish[1].padStart(2, "0")}`;
  }
  const numerico = t.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (numerico) return `${numerico[3]}-${numerico[2].padStart(2, "0")}-${numerico[1].padStart(2, "0")}`;
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null;
}

function extraerFechaEmision(texto) {
  const m = texto.match(/Fecha\s*(?:de\s*)?Emisi[oó]n\s*:?\s*([^\n]+)/i);
  return m ? parsearFecha(m[1]) : null;
}

function extraerMontoTotal(texto) {
  const m = texto.match(/\bTOTAL\s*\$?\s*([\d.,]+)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function extraerTipoDocumento(texto) {
  const patrones = [
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

async function main() {
  let procesados = 0;
  let desde = 0;
  const tamanoPagina = 500;

  for (;;) {
    const { data, error } = await supabase
      .from("facturas_compra_historico")
      .select("id, texto_extraido")
      .range(desde, desde + tamanoPagina - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const fila of data) {
      const texto = fila.texto_extraido ?? "";
      const { error: errUpdate } = await supabase
        .from("facturas_compra_historico")
        .update({
          folio: extraerFolio(texto),
          tipo_documento_detectado: extraerTipoDocumento(texto),
          rut_emisor: extraerRutEmisor(texto),
          razon_social_emisor: extraerRazonSocialEmisor(texto),
          fecha_emision: extraerFechaEmision(texto),
          monto_total: extraerMontoTotal(texto),
        })
        .eq("id", fila.id);
      if (errUpdate) console.error(`Error actualizando ${fila.id}:`, errUpdate.message);
      procesados++;
    }

    console.log(`Procesadas ${procesados} filas...`);
    desde += tamanoPagina;
  }

  console.log(`Listo. Total re-procesadas: ${procesados}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
