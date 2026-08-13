// Carga historica de Facturas IH: sube a SharePoint (misma convencion de
// rutas que lib/finanzas-ih/sharepoint-ih.ts) y a Supabase
// (finanzas_ih_documentos) el respaldo que el usuario ya descargo a mano del
// SII a "C:\Users\HUGO\Documents\RESPALDO DTE IH" (carpetas IH/IL, cada una
// con DTE_E_* con los XML emitidos y DTE_R_* con los PDF recibidos).
//
// Por que hace falta un script aparte en vez de solo copiar los archivos a
// SharePoint: el cron diario (lib/finanzas-ih/sincronizar.ts) solo evita
// volver a pedir un documento al SII si existe una fila en
// finanzas_ih_documentos con xml/pdf_sharepoint_item_id ya seteado (ver
// listarClavesYaRespaldadasIh en lib/finanzas-ih/finanzas-ih.ts). Sin esas
// filas, el sistema no sabe que el documento ya esta respaldado.
//
// Uso:
//   node --env-file=.env.local scripts/cargar-historico-ih.mjs --dry-run
//   node --env-file=.env.local scripts/cargar-historico-ih.mjs
//   node --env-file=.env.local scripts/cargar-historico-ih.mjs --limite=20
//
// --dry-run: parsea todo y muestra el resumen, no escribe en Supabase ni sube
//            a SharePoint. Usar SIEMPRE primero para revisar el resumen.
// --limite=N: procesa solo los primeros N documentos de cada carpeta (para
//             probar rapido antes de la corrida completa).

import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { createClient } from "@supabase/supabase-js";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

const RAIZ = "C:\\Users\\HUGO\\Documents\\RESPALDO DTE IH";
const RUT_POR_EMPRESA = { IH: "77031094-6", IL: "77997062-0" };
const CARPETA_RAIZ_POR_EMPRESA = {
  IH: "FINANZAS PERTEC/FINANZAS/FACTURAS IH",
  IL: "FINANZAS PERTEC/FINANZAS/FACTURAS IL",
};
const TIPO_DOCUMENTO_POR_CODIGO = { 33: "factura_afecta", 34: "factura_exenta", 56: "nota_debito", 61: "nota_credito", 52: "guia_despacho" };
const CODIGO_POR_TIPO_DOCUMENTO = { factura_afecta: 33, factura_exenta: 34, nota_debito: 56, nota_credito: 61, guia_despacho: 52 };
const MESES_ES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const DRY_RUN = process.argv.includes("--dry-run");
const argLimite = process.argv.find((a) => a.startsWith("--limite="));
const LIMITE = argLimite ? Number(argLimite.split("=")[1]) : Infinity;

function normalizarRut(rut) {
  return rut.replace(/\./g, "").trim().toUpperCase();
}

function claveDocumento(folio, rutContraparte) {
  return `${folio}|${normalizarRut(rutContraparte)}`;
}

function limpiarMonto(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(String(valor).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ---------- Parseo de XML (emitidos) ----------

const xmlParser = new XMLParser({ ignoreAttributes: true, isArray: (nombre) => ["Detalle"].includes(nombre) });

// Mismo shape que DteParseado["datos"] en lib/xml-dte.ts -- asi el modal de
// Facturas IH puede reusar exactamente el mismo componente de Facturas
// Historicas para mostrar el detalle de un documento emitido.
function extraerDatosEstructurados(encabezado, doc) {
  const emisor = encabezado.Emisor ?? {};
  const receptor = encabezado.Receptor ?? {};
  const detalleRaw = Array.isArray(doc.Detalle) ? doc.Detalle : doc.Detalle ? [doc.Detalle] : [];
  return {
    emisor: {
      rut: emisor.RUTEmisor ? String(emisor.RUTEmisor) : null,
      razonSocial: emisor.RznSoc ?? null,
      giro: emisor.GiroEmis ?? null,
    },
    receptor: {
      rut: receptor.RUTRecep ? String(receptor.RUTRecep) : null,
      razonSocial: receptor.RznSocRecep ?? null,
      giro: receptor.GiroRecep ?? null,
      direccion: [receptor.DirRecep, receptor.CmnaRecep, receptor.CiudadRecep].filter(Boolean).join(", ") || null,
    },
    detalle: detalleRaw.map((item) => ({
      nombre: item.NmbItem ? String(item.NmbItem) : "",
      descripcion: item.DscItem ? String(item.DscItem) : null,
      cantidad: item.QtyItem !== undefined ? Number(item.QtyItem) : null,
      precioUnitario: item.PrcItem !== undefined ? Number(item.PrcItem) : null,
      monto: item.MontoItem !== undefined ? Number(item.MontoItem) : null,
    })),
  };
}

function parsearXmlEmitido(contenidoXml, empresa) {
  const parsed = xmlParser.parse(contenidoXml);
  const dteRaiz = parsed?.EnvioDTE?.SetDTE?.DTE;
  const dte = Array.isArray(dteRaiz) ? dteRaiz[0] : dteRaiz;
  const doc = dte?.Documento;
  const encabezado = doc?.Encabezado;
  if (!encabezado) throw new Error("XML sin Encabezado/Documento reconocible");

  const idDoc = encabezado.IdDoc;
  const totales = encabezado.Totales ?? {};
  const codigoDte = Number(idDoc.TipoDTE);
  const tipoDocumento = TIPO_DOCUMENTO_POR_CODIGO[codigoDte];
  if (!tipoDocumento) throw new Error(`TipoDTE ${codigoDte} no soportado en Facturas IH`);

  const fechaEmision = String(idDoc.FchEmis).trim();
  return {
    empresa,
    tipoDocumento,
    direccion: "venta",
    codigoDte,
    estadoSii: null,
    rutContraparte: normalizarRut(String(encabezado.Receptor.RUTRecep)),
    razonSocialContraparte: encabezado.Receptor.RznSocRecep ?? null,
    datos: extraerDatosEstructurados(encabezado, doc),
    folio: Number(idDoc.Folio),
    fechaEmision,
    montoExento: limpiarMonto(totales.MntExe),
    montoNeto: limpiarMonto(totales.MntNeto),
    montoIva: limpiarMonto(totales.IVA),
    montoTotal: limpiarMonto(totales.MntTotal),
    periodo: fechaEmision.slice(0, 7).replace("-", ""),
    fuente: "carga_historica",
  };
}

// ---------- Parseo de PDF (recibidos) ----------

function detectarTipoDocumentoPdf(textoDesdeRutEmisor) {
  const cabecera = textoDesdeRutEmisor.split("\n").slice(0, 6).join(" ").toUpperCase();
  if (cabecera.includes("NOTA DE CREDITO") || cabecera.includes("NOTA CREDITO")) return "nota_credito";
  if (cabecera.includes("NOTA DE DEBITO") || cabecera.includes("NOTA DEBITO")) return "nota_debito";
  if (cabecera.includes("GUIA DE DESPACHO") || cabecera.includes("GUIA DESPACHO")) return "guia_despacho";
  if (cabecera.includes("EXENTA")) return "factura_exenta";
  if (cabecera.includes("FACTURA")) return "factura_afecta";
  return null;
}

// La razon social del emisor es todo el texto antes del primer "Giro:" del
// PDF (encabezado de la empresa que factura, puede venir en 1 o 2 lineas
// segun el largo del nombre) -- confirmado igual en todas las muestras
// revisadas del portal SII.
function extraerRazonSocialEmisor(texto) {
  const idx = texto.indexOf("Giro:");
  if (idx === -1) return null;
  const nombre = texto.slice(0, idx).replace(/\s+/g, " ").trim();
  return nombre || null;
}

function parsearFechaPdf(texto) {
  const m = texto.match(/Fecha Emision:\s*(\d{1,2})\s*de\s*(\w+)\s*del\s*(\d{4})/i);
  if (!m) return null;
  const mes = MESES_ES[m[2].toLowerCase()];
  if (!mes) return null;
  return `${m[3]}-${String(mes).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function parsearPdfRecibido(texto, empresa) {
  const primeraRutIdx = texto.indexOf("R.U.T.:");
  const segundaRutIdx = texto.indexOf("R.U.T.:", primeraRutIdx + 1);
  if (primeraRutIdx === -1 || segundaRutIdx === -1) throw new Error("No se encontraron 2 RUT en el PDF");

  const rutEmisorMatch = texto.slice(segundaRutIdx).match(/R\.U\.T\.:\s*([\d.]+-[\dkK])/);
  if (!rutEmisorMatch) throw new Error("No se pudo extraer el RUT emisor del PDF");

  const bloqueDesdeEmisor = texto.slice(segundaRutIdx);
  const tipoDocumento = detectarTipoDocumentoPdf(bloqueDesdeEmisor);
  if (!tipoDocumento) throw new Error("No se pudo determinar el tipo de documento del PDF");

  const folioMatch = texto.match(/N[ºo]\s*(\d+)/);
  if (!folioMatch) throw new Error("No se pudo extraer el folio del PDF");

  const fechaEmision = parsearFechaPdf(texto);
  if (!fechaEmision) throw new Error("No se pudo extraer la fecha de emision del PDF");

  const montoNeto = texto.match(/MONTO NETO\$\s*([\d.,]+)/i);
  const montoExento = texto.match(/MONTO EXENTO\$\s*([\d.,]+)/i);
  const montoIva = texto.match(/I\.V\.A\.[^$]*\$\s*([\d.,]+)/i);
  const montoTotal = texto.match(/TOTAL\$\s*([\d.,]+)/i);

  return {
    empresa,
    tipoDocumento,
    direccion: "compra",
    codigoDte: CODIGO_POR_TIPO_DOCUMENTO[tipoDocumento],
    estadoSii: null,
    rutContraparte: normalizarRut(rutEmisorMatch[1]),
    razonSocialContraparte: extraerRazonSocialEmisor(texto),
    folio: Number(folioMatch[1]),
    fechaEmision,
    montoExento: montoExento ? limpiarMonto(montoExento[1]) : null,
    montoNeto: montoNeto ? limpiarMonto(montoNeto[1]) : null,
    montoIva: montoIva ? limpiarMonto(montoIva[1]) : null,
    montoTotal: montoTotal ? limpiarMonto(montoTotal[1]) : null,
    periodo: fechaEmision.slice(0, 7).replace("-", ""),
    fuente: "carga_historica",
  };
}

// ---------- Recorrido de carpetas ----------

async function recolectarDocumentos() {
  const documentos = [];
  const errores = [];

  for (const empresa of ["IH", "IL"]) {
    const carpetaEmpresa = path.join(RAIZ, empresa);
    if (!fs.existsSync(carpetaEmpresa)) continue;

    const carpetaE = fs.readdirSync(carpetaEmpresa).find((d) => d.startsWith("DTE_E_"));
    const carpetaR = fs.readdirSync(carpetaEmpresa).find((d) => d.startsWith("DTE_R_"));

    if (carpetaE) {
      const dir = path.join(carpetaEmpresa, carpetaE);
      const archivos = fs.readdirSync(dir).filter((f) => f.endsWith(".xml")).slice(0, LIMITE);
      for (const archivo of archivos) {
        const rutaCompleta = path.join(dir, archivo);
        try {
          // Bytes originales sin tocar para subir a SharePoint (la firma del
          // DTE depende del contenido exacto); decodificado aparte solo para
          // extraer campos con el parser.
          const bufferOriginal = fs.readFileSync(rutaCompleta);
          const contenidoParaParsear = bufferOriginal.toString("utf-8");
          const doc = parsearXmlEmitido(contenidoParaParsear, empresa);
          const codigoPortal = archivo.match(/CODIGO_(\d+)\./)?.[1] ?? null;
          documentos.push({ ...doc, codigoPortal, archivo: rutaCompleta, tipoArchivo: "xml", contenidoArchivo: bufferOriginal });
        } catch (err) {
          errores.push({ archivo: rutaCompleta, error: err.message });
        }
      }
    }

    if (carpetaR) {
      const dir = path.join(carpetaEmpresa, carpetaR);
      const archivos = fs.readdirSync(dir).filter((f) => f.endsWith(".pdf")).slice(0, LIMITE);
      for (const archivo of archivos) {
        const rutaCompleta = path.join(dir, archivo);
        try {
          const buffer = fs.readFileSync(rutaCompleta);
          const { text } = await pdfParse(buffer);
          const doc = parsearPdfRecibido(text, empresa);
          const codigoPortal = archivo.match(/CODIGO_(\d+)\./)?.[1] ?? null;
          documentos.push({ ...doc, codigoPortal, archivo: rutaCompleta, tipoArchivo: "pdf", contenidoArchivo: buffer });
        } catch (err) {
          errores.push({ archivo: rutaCompleta, error: err.message });
        }
      }
    }
  }

  return { documentos, errores };
}

// ---------- Supabase ----------

function crearClienteSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function guardarEnSupabase(supabase, documentos) {
  const filas = documentos.map((d) => ({
    empresa: d.empresa,
    tipo_documento: d.tipoDocumento,
    direccion: d.direccion,
    codigo_dte: d.codigoDte,
    estado_sii: d.estadoSii,
    rut_contraparte: d.rutContraparte,
    razon_social_contraparte: d.razonSocialContraparte,
    datos: d.datos ?? null,
    folio: d.folio,
    fecha_emision: d.fechaEmision,
    monto_exento: d.montoExento,
    monto_neto: d.montoNeto,
    monto_iva: d.montoIva,
    monto_total: d.montoTotal,
    periodo: d.periodo,
    fuente: d.fuente,
    codigo_portal: d.codigoPortal,
    actualizado_en: new Date().toISOString(),
  }));

  // En bloques: un solo upsert con >1000 filas es innecesariamente arriesgado
  // (todo o nada si Supabase corta la conexion a mitad de camino).
  const TAMANO_BLOQUE = 200;
  for (let i = 0; i < filas.length; i += TAMANO_BLOQUE) {
    const bloque = filas.slice(i, i + TAMANO_BLOQUE);
    const { error } = await supabase
      .from("finanzas_ih_documentos")
      .upsert(bloque, { onConflict: "empresa,tipo_documento,folio,rut_contraparte" });
    if (error) throw new Error(`Upsert Supabase (bloque ${i}): ${error.message}`);
    console.log(`  Supabase: ${Math.min(i + TAMANO_BLOQUE, filas.length)}/${filas.length} filas`);
  }
}

async function obtenerRespaldosExistentes(supabase) {
  const { data, error } = await supabase
    .from("finanzas_ih_documentos")
    .select("folio, rut_contraparte, xml_sharepoint_item_id, pdf_sharepoint_item_id");
  if (error) throw new Error(error.message);

  const mapa = new Map();
  for (const fila of data ?? []) {
    mapa.set(claveDocumento(fila.folio, fila.rut_contraparte), {
      tieneXml: !!fila.xml_sharepoint_item_id,
      tienePdf: !!fila.pdf_sharepoint_item_id,
    });
  }
  return mapa;
}

async function actualizarRespaldoSupabase(supabase, doc, subida) {
  const campo = doc.tipoArchivo === "xml" ? "xml" : "pdf";
  const { error } = await supabase
    .from("finanzas_ih_documentos")
    .update({
      [`${campo}_sharepoint_item_id`]: subida.itemId,
      [`${campo}_sharepoint_web_url`]: subida.webUrl,
      actualizado_en: new Date().toISOString(),
    })
    .eq("empresa", doc.empresa)
    .eq("tipo_documento", doc.tipoDocumento)
    .eq("folio", doc.folio)
    .eq("rut_contraparte", doc.rutContraparte);
  if (error) throw new Error(`Update respaldo Supabase folio ${doc.folio}: ${error.message}`);
}

// ---------- SharePoint (Graph) ----------

function crearClienteGraph() {
  const credencial = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID,
    process.env.AZURE_CLIENT_ID,
    process.env.AZURE_CLIENT_SECRET
  );
  return {
    async cliente() {
      const token = await credencial.getToken("https://graph.microsoft.com/.default");
      if (!token) throw new Error("No fue posible autenticar contra Microsoft Graph");
      return Client.init({ authProvider: (done) => done(null, token.token) });
    },
  };
}

function codificarRuta(ruta) {
  return ruta.split("/").map(encodeURIComponent).join("/");
}

async function subirArchivo(graph, siteId, empresa, tipoDocumento, anio, mes, nombreArchivo, contenido) {
  const ruta = `${CARPETA_RAIZ_POR_EMPRESA[empresa]}/${anio}/${String(mes).padStart(2, "0")}/${tipoDocumento}/${nombreArchivo}`;
  const resultado = await graph.api(`/sites/${siteId}/drive/root:/${codificarRuta(ruta)}:/content`).put(contenido);
  return { itemId: resultado.id, webUrl: resultado.webUrl };
}

// ---------- Concurrencia limitada ----------

async function procesarConLimite(items, limite, fn) {
  const resultados = new Array(items.length);
  let siguiente = 0;
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente++;
      resultados[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
  return resultados;
}

// ---------- Main ----------

async function main() {
  console.log(`Recorriendo ${RAIZ} ${DRY_RUN ? "(DRY RUN)" : ""}${LIMITE !== Infinity ? ` (limite ${LIMITE}/carpeta)` : ""} ...`);
  const { documentos, errores } = await recolectarDocumentos();

  const porTipo = {};
  for (const d of documentos) porTipo[`${d.empresa}/${d.direccion}/${d.tipoDocumento}`] = (porTipo[`${d.empresa}/${d.direccion}/${d.tipoDocumento}`] ?? 0) + 1;
  console.log("\nResumen de parseo:");
  for (const [k, v] of Object.entries(porTipo).sort()) console.log(`  ${k}: ${v}`);
  console.log(`  TOTAL parseados: ${documentos.length}`);
  console.log(`  Errores de parseo: ${errores.length}`);
  if (errores.length > 0) {
    console.log("\nArchivos con error (no se cargan):");
    for (const e of errores) console.log(`  ${e.archivo}: ${e.error}`);
  }

  if (DRY_RUN) {
    console.log("\nDRY RUN: no se escribio nada en Supabase ni SharePoint.");
    return;
  }

  const supabase = crearClienteSupabase();
  const siteId = process.env.SHAREPOINT_FACTURAS_SITE_ID;
  if (!siteId) throw new Error("Falta SHAREPOINT_FACTURAS_SITE_ID");

  console.log("\nGuardando metadatos en Supabase...");
  await guardarEnSupabase(supabase, documentos);

  console.log("\nRevisando que documentos ya tienen respaldo en SharePoint...");
  const yaRespaldados = await obtenerRespaldosExistentes(supabase);

  const pendientesSubida = documentos.filter((d) => {
    const estado = yaRespaldados.get(claveDocumento(d.folio, d.rutContraparte));
    if (!estado) return true;
    return d.tipoArchivo === "xml" ? !estado.tieneXml : !estado.tienePdf;
  });
  console.log(`  ${documentos.length - pendientesSubida.length} ya tenian respaldo, se omiten.`);
  console.log(`  ${pendientesSubida.length} documentos a subir a SharePoint.`);

  const { cliente } = crearClienteGraph();
  const graph = await cliente();

  let subidos = 0;
  let fallidos = 0;
  await procesarConLimite(pendientesSubida, 4, async (doc) => {
    try {
      const [anio, mes] = doc.fechaEmision.split("-");
      const nombreArchivo = `${doc.folio}.${doc.tipoArchivo}`;
      const subida = await subirArchivo(graph, siteId, doc.empresa, doc.tipoDocumento, anio, mes, nombreArchivo, doc.contenidoArchivo);
      await actualizarRespaldoSupabase(supabase, doc, subida);
      subidos++;
      if (subidos % 50 === 0) console.log(`  ... ${subidos}/${pendientesSubida.length} subidos`);
    } catch (err) {
      fallidos++;
      console.error(`  ERROR subiendo ${doc.archivo}: ${err.message}`);
    }
  });

  console.log(`\nListo. Subidos: ${subidos}. Fallidos: ${fallidos}.`);
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
