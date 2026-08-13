// Completa el PDF (no el XML, que ya existe desde la carga historica) de
// los documentos EMITIDOS (venta) de los ultimos N meses que todavia no
// tienen pdf_sharepoint_item_id -- el resto los va completando solo el cron
// diario (limiteRespaldo=5 por corrida, ver lib/finanzas-ih/sincronizar.ts),
// esto es solo para ponerse al dia rapido con lo reciente. Se puede volver
// a correr con un numero de meses mas grande para seguir completando hacia
// atras (se salta automaticamente lo que ya tiene PDF).
//
// Uso: node --env-file=.env.local scripts/completar-pdf-emitidas.mjs [meses]
// (meses por defecto: 3)
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

const MESES = Number(process.argv[2] ?? 3);

const CARPETA_RAIZ_POR_EMPRESA = {
  IH: "FINANZAS PERTEC/FINANZAS/FACTURAS IH",
  IL: "FINANZAS PERTEC/FINANZAS/FACTURAS IL",
};

const TIPO_DOCUMENTO_DESDE_TEXTO = {
  "Factura Electronica": "factura_afecta",
  "Factura Exenta Electronica": "factura_exenta",
  "Nota de Debito Electronica": "nota_debito",
  "Nota de Credito Electronica": "nota_credito",
  "Guia de Despacho Electronica": "guia_despacho",
  "Boleta Electronica": "boleta",
  "Boleta Exenta Electronica": "boleta",
};

function limpiarRut(rut) {
  const raw = rut.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
  return `${raw.slice(0, -1)}-${raw.slice(-1)}`;
}

function claveDocumento(folio, rut) {
  return `${folio}|${rut.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase()}`;
}

function fechaAIso(fecha) {
  const m = fecha.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? fecha.trim() : null;
}

async function login(page, rutRepr, clave) {
  await page.goto(
    "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html" +
      "?https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D2%26TIPO%3D4",
    { timeout: 40000 }
  );
  await page.waitForSelector("#rutcntr", { timeout: 20000 });
  await page.locator("#rutcntr").fill(limpiarRut(rutRepr));
  await page.locator("#rutcntr").blur();
  await page.locator("#clave").fill(clave);
  await page.locator("#bt_ingresar").click();
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
}

async function seleccionarEmpresa(page, rutEmpresa) {
  await page.goto("https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D2%26TIPO%3D4", {
    timeout: 30000,
  });
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
  if (!page.url().includes("mipeSelEmpresa")) return;

  const opciones = await page.evaluate(() => {
    const sel = document.querySelector("select");
    return sel ? Array.from(sel.options).map((o) => ({ value: o.value, text: o.text.trim() })) : [];
  });
  const emp = limpiarRut(rutEmpresa).replace(/-/g, "");
  const elegida =
    opciones.find((o) => o.text.toUpperCase().replace(/[.\-\s]/g, "").includes(emp)) ??
    (opciones.length === 1 ? opciones[0] : null);
  if (!elegida) throw new Error(`No se encontro la empresa ${rutEmpresa} en el selector.`);

  await page.locator("select").first().selectOption({ value: elegida.value });
  const btn = page.locator("input[type='submit'], button[type='submit'], input[value*='ontinuar' i]");
  if ((await btn.count()) > 0) await btn.first().click();
  else await page.evaluate(() => document.querySelector("form")?.submit());
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
}

async function extraerFilasDeUnaPagina(page, numPag) {
  const url = `https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsEmi.cgi?RUT_RECP=&FOLIO=&RZN_SOC=&FEC_DESDE=&FEC_HASTA=&TPO_DOC=&ESTADO=&ORDEN=&NUM_PAG=${numPag}`;
  await page.goto(url, { timeout: 30000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});

  return page.evaluate(() => {
    const filas = Array.from(document.querySelectorAll("table tbody tr"));
    return filas
      .map((tr) => {
        const celdas = Array.from(tr.querySelectorAll("td"));
        if (celdas.length < 7) return null;
        const textos = celdas.map((td) => (td.textContent || "").trim());
        const [, rut, razonSocial, tipoTexto, folioTexto, fecha] = textos;
        const folio = Number(folioTexto.replace(/\D/g, ""));
        if (!Number.isFinite(folio)) return null;
        const link = celdas[0].querySelector('a[href*="mipeGesDocEmi"]');
        return { folio, rut: rut.trim(), razonSocial: razonSocial.trim() || null, tipoTexto: tipoTexto.trim(), fecha: fecha.trim(), href: link ? link.href : null };
      })
      .filter((f) => f !== null);
  });
}

async function esperarAsentamiento(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function descargarPdfEmitido(page, hrefDetalle) {
  await page.goto(hrefDetalle, { timeout: 20000 });
  await esperarAsentamiento(page);
  const pdfSrc = await page.evaluate(() => {
    const iframe = document.querySelector('iframe[src*="mipeDisplayPDF"]');
    return iframe ? iframe.src : null;
  });
  if (!pdfSrc) return null;
  const respuesta = await page.request.get(pdfSrc);
  if (!respuesta.ok()) return null;
  const buffer = await respuesta.body();
  return buffer.length > 500 ? buffer : null;
}

async function main() {
  const rutRepr = process.env.SII_RUT_REPRESENTANTE;
  const clave = process.env.SII_CLAVE_TRIBUTARIA;
  const empresas = [
    { empresa: "IH", rutEmpresa: process.env.SII_RUT_EMPRESA_IH },
    { empresa: "IL", rutEmpresa: process.env.SII_RUT_EMPRESA_IL },
  ];
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const credencial = new ClientSecretCredential(process.env.AZURE_TENANT_ID, process.env.AZURE_CLIENT_ID, process.env.AZURE_CLIENT_SECRET);
  async function clienteGraph() {
    const token = await credencial.getToken("https://graph.microsoft.com/.default");
    return Client.init({ authProvider: (done) => done(null, token.token) });
  }
  function codificarRuta(ruta) {
    return ruta.split("/").map(encodeURIComponent).join("/");
  }
  async function subirArchivo(graph, empresa, tipoDocumento, anio, mes, nombreArchivo, contenido) {
    const ruta = `${CARPETA_RAIZ_POR_EMPRESA[empresa]}/${anio}/${String(mes).padStart(2, "0")}/${tipoDocumento}/${nombreArchivo}`;
    const resultado = await graph.api(`/sites/${process.env.SHAREPOINT_FACTURAS_SITE_ID}/drive/root:/${codificarRuta(ruta)}:/content`).put(contenido);
    return { itemId: resultado.id, webUrl: resultado.webUrl };
  }

  const desde = new Date();
  desde.setMonth(desde.getMonth() - MESES);
  const desdeIso = desde.toISOString().slice(0, 10);
  console.log(`Completando PDF de emitidos desde ${desdeIso}...`);

  // Documentos que YA tienen PDF -- se saltan.
  const { data: filasConPdf } = await supabase
    .from("finanzas_ih_documentos")
    .select("folio, rut_contraparte")
    .eq("direccion", "venta")
    .not("pdf_sharepoint_item_id", "is", null);
  const yaTienenPdf = new Set((filasConPdf ?? []).map((f) => claveDocumento(f.folio, f.rut_contraparte)));
  console.log(`${yaTienenPdf.size} documentos ya tenian PDF.`);

  const browser = await chromium.launch({ headless: true });
  let completados = 0;
  let fallidos = 0;
  try {
    const page = await browser.newPage();
    await login(page, rutRepr, clave);

    for (const { empresa, rutEmpresa } of empresas) {
      await seleccionarEmpresa(page, rutEmpresa);
      console.log(`--- Empresa ${empresa} ---`);

      for (let numPag = 1; numPag <= 500; numPag++) {
        const filas = await extraerFilasDeUnaPagina(page, numPag);
        if (filas.length === 0) break;

        const fechaMasVieja = fechaAIso(filas[filas.length - 1]?.fecha);
        for (const fila of filas) {
          const fechaIso = fechaAIso(fila.fecha);
          if (fechaIso && fechaIso < desdeIso) continue;
          if (!fila.href) continue;

          const clave = claveDocumento(fila.folio, fila.rut);
          if (yaTienenPdf.has(clave)) continue;

          const tipoDocumento = TIPO_DOCUMENTO_DESDE_TEXTO[fila.tipoTexto];
          if (!tipoDocumento) continue; // tipos no rastreados (43/46/110/111/112 etc.)

          try {
            const pdf = await descargarPdfEmitido(page, fila.href);
            if (!pdf) {
              console.log(`  sin PDF: folio ${fila.folio} (${fila.tipoTexto})`);
              continue;
            }
            const fecha = fechaIso ? new Date(fechaIso) : new Date();
            const graph = await clienteGraph();
            const subida = await subirArchivo(graph, empresa, tipoDocumento, fecha.getFullYear(), fecha.getMonth() + 1, `${fila.folio}.pdf`, pdf);

            const { error } = await supabase
              .from("finanzas_ih_documentos")
              .update({ pdf_sharepoint_item_id: subida.itemId, pdf_sharepoint_web_url: subida.webUrl, actualizado_en: new Date().toISOString() })
              .eq("empresa", empresa)
              .eq("tipo_documento", tipoDocumento)
              .eq("folio", fila.folio)
              .eq("rut_contraparte", fila.rut.replace(/\./g, ""));
            if (error) {
              console.log(`  ERROR guardando folio ${fila.folio}: ${error.message}`);
              fallidos++;
            } else {
              completados++;
              yaTienenPdf.add(clave);
              if (completados % 20 === 0) console.log(`  ... ${completados} completados`);
            }
          } catch (err) {
            console.log(`  ERROR folio ${fila.folio}: ${err.message}`);
            fallidos++;
          }
        }

        if (fechaMasVieja && fechaMasVieja < desdeIso) break; // esta pagina ya cruzo la ventana
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\nListo. Completados: ${completados}. Fallidos: ${fallidos}.`);
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
