import "server-only";
import { lanzarNavegador } from "../playwright-navegador";
import { login } from "../sii-rcv";
import type { CredencialesSii } from "../sii-rcv";
import type { EmpresaIh, EmpresaIhConfig } from "./sii-rcv-ih";
import type { DocumentoIh } from "./sii-rcv-ih";
import { descargarDocumentoEmitido, descargarPdfRecibido } from "./sii-descarga-documentos-ih";
import { subirArchivoIh } from "./sharepoint-ih";
import type { RespaldoDocumento } from "./finanzas-ih";
import { claveDocumento } from "./claves";
import { parsearXmlDte } from "../xml-dte";

// Portal MIPYME del SII (mipeAdminDocsEmi.cgi / mipeAdminDocsRcp.cgi):
// paginas HTML planas (sin Angular, sin CSV), descubiertas con
// scripts/explorar-portal-mipyme.mjs y scripts/explorar-detalle-documento.mjs.
//
// Se usan para TRES cosas, con pasadas SEPARADAS por proposito (no una sola
// combinada -- ver el porque en extraerGuiasYCodigosIh):
// 1) Guias de despacho (52): no existen en el RCV (no llevan IVA), asi que
//    esta es su UNICA fuente. Solo hay vista de EMITIDAS (Emi); no existe
//    equivalente de RECIBIDAS.
// 2) El CODIGO interno de cada documento (emitido o recibido), guardado como
//    referencia en finanzas_ih_documentos.codigo_portal -- el RCV no lo trae.
// 3) El respaldo de XML (emitidos) / PDF (recibidos) a SharePoint: se hace
//    EN LINEA, inmediatamente al descubrir cada fila, usando el link real
//    que trae esa fila (con su ALL_PAGE_ANT) -- exactamente como hace
//    descargador_sii.py. Probado en vivo que un CODIGO reconstruido "en
//    frio" (sin ese link real) rebota con "boton no disponible": el detalle
//    de un documento (mipeGesDocEmi.cgi / mipeGesDocRcp.cgi) solo funciona
//    llegando desde el link real de su propia fila en el listado.

const CODIGO_DTE_GUIA_DESPACHO = 52;
// Boletas (39 afecta / 41 exenta): igual que guia_despacho, no salen del RCV
// (CODIGOS_DTE_IH en sii-rcv-ih.ts no las incluye) -- el Portal MIPYME es su
// unica fuente aqui, con pasadas DEDICADAS por el mismo motivo que las guias
// (mezcladas con "todos los documentos" la paginacion las corta muy pronto).
const CODIGO_DTE_BOLETA_AFECTA = 39;
const CODIGO_DTE_BOLETA_EXENTA = 41;

function limpiarRut(rut: string): string {
  const raw = rut.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
  return `${raw.slice(0, -1)}-${raw.slice(-1)}`;
}

// El link "Cambiar de Empresa" no aparecio en el menu (ver exploracion), pero
// re-visitar mipeSelEmpresa.cgi dentro de la misma sesion si funciona -- SII
// simplemente vuelve a mostrar el selector, igual que si fuera la primera
// vez despues del login. Confirmado con scripts/explorar-cambio-empresa.mjs.
export async function seleccionarEmpresa(page: import("playwright-core").Page, rutEmpresa: string): Promise<void> {
  await page.goto("https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D2%26TIPO%3D4", {
    timeout: 30000,
  });
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
  if (!page.url().includes("mipeSelEmpresa")) return; // ya estaba en esa empresa, SII salto el selector

  const opciones = await page.evaluate(() => {
    const sel = document.querySelector("select");
    return sel ? Array.from(sel.options).map((o) => ({ value: o.value, text: o.text.trim() })) : [];
  });
  const emp = limpiarRut(rutEmpresa).replace(/-/g, "");
  const elegida =
    opciones.find((o) => o.text.toUpperCase().replace(/[.\-\s]/g, "").includes(emp)) ??
    (opciones.length === 1 ? opciones[0] : null);
  if (!elegida) throw new Error(`No se encontro la empresa ${rutEmpresa} en el selector del SII.`);

  await page.locator("select").first().selectOption({ value: elegida.value });
  const btn = page.locator(
    "input[type='submit'], button[type='submit'], input[value*='eleccionar' i], input[value*='ontinuar' i]"
  );
  if ((await btn.count()) > 0) await btn.first().click();
  else await page.evaluate(() => document.querySelector("form")?.submit());
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
}

function fechaAIso(fecha: string): string | null {
  const m = fecha.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? fecha.trim() : null;
}

// Salvavidas contra un loop infinito si el parseo de "pagina sin filas"
// falla alguna vez -- NO es el limite real de paginas (eso lo decide el
// corte por fecha o la primera pagina vacia). 500 paginas cubren de sobra
// una carga inicial con anos de historial a ~10-15 filas por pagina.
const MAX_PAGINAS = 500;

interface FilaPortal {
  folio: number;
  rut: string;
  razonSocial: string | null;
  tipoTexto: string;
  fecha: string;
  monto: number | null;
  codigo: string | null;
  href: string | null; // link REAL de la fila (con ALL_PAGE_ANT) -- ver nota arriba
}

async function extraerFilasDeUnaPagina(
  page: import("playwright-core").Page,
  baseUrl: string,
  parametroRut: "RUT_RECP" | "RUT_EMI",
  linkCgi: "mipeGesDocEmi" | "mipeGesDocRcp",
  tpoDoc: number | "",
  numPag: number
): Promise<FilaPortal[]> {
  const url = `${baseUrl}?${parametroRut}=&FOLIO=&RZN_SOC=&FEC_DESDE=&FEC_HASTA=&TPO_DOC=${tpoDoc}&ESTADO=&ORDEN=&NUM_PAG=${numPag}`;
  await page.goto(url, { timeout: 30000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});

  return page.evaluate(
    ({ linkCgi }) => {
      const filas = Array.from(document.querySelectorAll("table tbody tr"));
      return filas
        .map((tr) => {
          const celdas = Array.from(tr.querySelectorAll("td"));
          if (celdas.length < 7) return null;
          const textos = celdas.map((td) => (td.textContent || "").trim());
          const [, rut, razonSocial, tipoTexto, folioTexto, fecha, montoTexto] = textos;
          const folio = Number(folioTexto.replace(/\D/g, ""));
          const monto = Number(montoTexto.replace(/\D/g, ""));
          if (!Number.isFinite(folio)) return null;

          const link = celdas[0].querySelector(`a[href*="${linkCgi}"]`) as HTMLAnchorElement | null;
          let codigo: string | null = null;
          if (link) {
            try {
              codigo = new URL(link.href).searchParams.get("CODIGO");
            } catch {
              codigo = null;
            }
          }

          return {
            folio,
            rut: rut.trim(),
            razonSocial: razonSocial.trim() || null,
            tipoTexto: tipoTexto.trim(),
            fecha: fecha.trim(),
            monto: Number.isFinite(monto) ? monto : null,
            codigo,
            href: link ? link.href : null,
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null);
    },
    { linkCgi }
  );
}

export interface OpcionesGuiasIh {
  cargaInicial: boolean;
  ventanaDias?: number;
  // Documentos que YA tienen su XML/PDF en SharePoint (claveDocumento) -- se
  // saltan el respaldo en linea para no volver a pedirlos cada corrida.
  yaRespaldados: Set<string>;
  // Tope de respaldos en linea POR CORRIDA (no por empresa): cada uno son
  // 2-3 requests reales al SII mas una subida a Graph, y maxDuration=60s en
  // Vercel Hobby. El cron diario se va poniendo al dia de a poco.
  limiteRespaldo: number;
}

export interface ResultadoPortalMipymeIh {
  documentos: DocumentoIh[]; // solo guias_despacho (factura/notas ya las trae el RCV)
  codigosEmitidos: Map<string, string>; // clave = claveDocumento(folio, rutReceptor)
  codigosRecibidos: Map<string, string>; // clave = claveDocumento(folio, rutEmisor)
  respaldos: Map<string, RespaldoDocumento>; // clave = claveDocumento(folio, rutContraparte)
}

async function intentarRespaldarEnLinea(
  page: import("playwright-core").Page,
  fila: FilaPortal,
  empresa: EmpresaIh,
  tipoDocumento: string,
  direccion: "compra" | "venta",
  contexto: { respaldos: Map<string, RespaldoDocumento>; yaRespaldados: Set<string>; limiteRespaldo: number }
): Promise<void> {
  if (!fila.href) return;
  const clave = claveDocumento(fila.folio, fila.rut);
  if (contexto.yaRespaldados.has(clave) || contexto.respaldos.has(clave)) return;
  if (contexto.respaldos.size >= contexto.limiteRespaldo) return;

  try {
    const fechaIso = fechaAIso(fila.fecha);
    const fecha = fechaIso ? new Date(fechaIso) : new Date();
    const anio = fecha.getFullYear();
    const mes = fecha.getMonth() + 1;

    if (direccion === "venta") {
      const { xml, pdf } = await descargarDocumentoEmitido(page, fila.href);
      if (!xml && !pdf) return;

      const respaldo: RespaldoDocumento = {};
      if (pdf) {
        const subida = await subirArchivoIh(empresa, tipoDocumento, anio, mes, `${fila.folio}.pdf`, pdf);
        respaldo.pdfSharepointItemId = subida.itemId;
        respaldo.pdfSharepointWebUrl = subida.webUrl;
      }
      if (xml) {
        const subida = await subirArchivoIh(empresa, tipoDocumento, anio, mes, `${fila.folio}.xml`, xml);
        respaldo.xmlSharepointItemId = subida.itemId;
        respaldo.xmlSharepointWebUrl = subida.webUrl;
        // Mismo parser que Facturas Historicas (lib/xml-dte.ts): el XML de un
        // DTE del SII sigue siempre el mismo esquema, asi que se puede
        // guardar el detalle estructurado (emisor/receptor/items) para
        // mostrarlo bonito en el modal sin volver a pedirlo a SharePoint.
        const parseado = parsearXmlDte(xml)[0];
        if (parseado) respaldo.datos = parseado.datos;
      }
      contexto.respaldos.set(clave, respaldo);
    } else {
      const pdf = await descargarPdfRecibido(page, fila.href);
      if (!pdf) return;
      const subida = await subirArchivoIh(empresa, tipoDocumento, anio, mes, `${fila.folio}.pdf`, pdf);
      contexto.respaldos.set(clave, { pdfSharepointItemId: subida.itemId, pdfSharepointWebUrl: subida.webUrl });
    }
  } catch (err) {
    console.error(`[sii-guias-ih] respaldo folio ${fila.folio} (${empresa}/${direccion}):`, err);
  }
}

async function recorrerPaginas(
  page: import("playwright-core").Page,
  baseUrl: string,
  parametroRut: "RUT_RECP" | "RUT_EMI",
  linkCgi: "mipeGesDocEmi" | "mipeGesDocRcp",
  tpoDoc: number | "",
  cargaInicial: boolean,
  desdeIso: string,
  onPagina: (filas: FilaPortal[]) => Promise<void>
): Promise<void> {
  for (let numPag = 1; numPag <= MAX_PAGINAS; numPag++) {
    const filas = await extraerFilasDeUnaPagina(page, baseUrl, parametroRut, linkCgi, tpoDoc, numPag);
    if (filas.length === 0) break;
    await onPagina(filas);

    // Ordenado por folio/fecha descendente (mas reciente primero): si la
    // fila mas vieja de esta pagina ya cruzo la ventana, las siguientes
    // paginas son aun mas viejas -- se puede cortar.
    const fechaMasVieja = filas[filas.length - 1]?.fecha;
    if (!cargaInicial && fechaMasVieja && fechaMasVieja < desdeIso) break;
  }
}

export async function extraerGuiasYCodigosIh(
  creds: Pick<CredencialesSii, "rutRepresentante" | "claveTributaria">,
  empresas: EmpresaIhConfig[],
  opciones: OpcionesGuiasIh
): Promise<ResultadoPortalMipymeIh> {
  const ventanaDias = opciones.ventanaDias ?? 7;
  const desde = new Date();
  desde.setDate(desde.getDate() - ventanaDias);
  const desdeIso = desde.toISOString().slice(0, 10);

  const browser = await lanzarNavegador();
  try {
    const page = await browser.newPage();
    await login(page, { ...creds, rutEmpresa: "" });

    const documentos: DocumentoIh[] = [];
    const codigosEmitidos = new Map<string, string>();
    const codigosRecibidos = new Map<string, string>();
    const respaldos = new Map<string, RespaldoDocumento>();
    const contextoRespaldo = { respaldos, yaRespaldados: opciones.yaRespaldados, limiteRespaldo: opciones.limiteRespaldo };

    const URL_EMI = "https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsEmi.cgi";
    const URL_RCP = "https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsRcp.cgi";

    for (const { empresa, rutEmpresa } of empresas) {
      await seleccionarEmpresa(page, rutEmpresa);

      // Pasada DEDICADA a guias (TPO_DOC=52): mezclarla con "todos los
      // documentos" diluye demasiado la paginacion (facturas/notas son
      // mucho mas numerosas) y corta la profundidad historica de guias
      // muy temprano -- probado en vivo: de 200 guias esperadas, la pasada
      // combinada solo alcanzaba a traer 7.
      await recorrerPaginas(page, URL_EMI, "RUT_RECP", "mipeGesDocEmi", CODIGO_DTE_GUIA_DESPACHO, opciones.cargaInicial, desdeIso, async (filas) => {
        for (const fila of filas) {
          if (fila.codigo) codigosEmitidos.set(claveDocumento(fila.folio, fila.rut), fila.codigo);
          documentos.push({
            empresa: empresa as EmpresaIh,
            tipoDocumento: "guia_despacho",
            direccion: "venta",
            codigoDte: CODIGO_DTE_GUIA_DESPACHO,
            estadoSii: null,
            rutContraparte: fila.rut,
            razonSocialContraparte: fila.razonSocial,
            folio: fila.folio,
            fechaEmision: fechaAIso(fila.fecha),
            montoExento: null,
            montoNeto: null,
            montoIva: null,
            montoTotal: fila.monto,
            periodo: fila.fecha.slice(0, 7).replace("-", ""),
            fuente: "portal_mipyme" as const,
            codigoPortal: fila.codigo,
          });
          await intentarRespaldarEnLinea(page, fila, empresa, "guia_despacho", "venta", contextoRespaldo);
        }
      });

      // Pasadas DEDICADAS a boletas (39/41), emitidas Y recibidas: a
      // diferencia de facturas/notas (que ya trae el RCV con mas detalle),
      // las boletas no salen del RCV -- hay que crear el DocumentoIh aca
      // mismo, con los datos limitados que da el listado del portal (sin
      // desglose neto/IVA, igual que guia_despacho).
      for (const [codigoDte, tpoDoc] of [
        [CODIGO_DTE_BOLETA_AFECTA, CODIGO_DTE_BOLETA_AFECTA] as const,
        [CODIGO_DTE_BOLETA_EXENTA, CODIGO_DTE_BOLETA_EXENTA] as const,
      ]) {
        await recorrerPaginas(page, URL_EMI, "RUT_RECP", "mipeGesDocEmi", tpoDoc, opciones.cargaInicial, desdeIso, async (filas) => {
          for (const fila of filas) {
            if (fila.codigo) codigosEmitidos.set(claveDocumento(fila.folio, fila.rut), fila.codigo);
            documentos.push({
              empresa: empresa as EmpresaIh,
              tipoDocumento: "boleta",
              direccion: "venta",
              codigoDte,
              estadoSii: null,
              rutContraparte: fila.rut,
              razonSocialContraparte: fila.razonSocial,
              folio: fila.folio,
              fechaEmision: fechaAIso(fila.fecha),
              montoExento: null,
              montoNeto: null,
              montoIva: null,
              montoTotal: fila.monto,
              periodo: fila.fecha.slice(0, 7).replace("-", ""),
              fuente: "portal_mipyme" as const,
              codigoPortal: fila.codigo,
            });
            await intentarRespaldarEnLinea(page, fila, empresa, "boleta", "venta", contextoRespaldo);
          }
        });

        await recorrerPaginas(page, URL_RCP, "RUT_EMI", "mipeGesDocRcp", tpoDoc, opciones.cargaInicial, desdeIso, async (filas) => {
          for (const fila of filas) {
            if (fila.codigo) codigosRecibidos.set(claveDocumento(fila.folio, fila.rut), fila.codigo);
            documentos.push({
              empresa: empresa as EmpresaIh,
              tipoDocumento: "boleta",
              direccion: "compra",
              codigoDte,
              estadoSii: null,
              rutContraparte: fila.rut,
              razonSocialContraparte: fila.razonSocial,
              folio: fila.folio,
              fechaEmision: fechaAIso(fila.fecha),
              montoExento: null,
              montoNeto: null,
              montoIva: null,
              montoTotal: fila.monto,
              periodo: fila.fecha.slice(0, 7).replace("-", ""),
              fuente: "portal_mipyme" as const,
              codigoPortal: fila.codigo,
            });
            await intentarRespaldarEnLinea(page, fila, empresa, "boleta", "compra", contextoRespaldo);
          }
        });
      }

      // Pasada "todos los documentos" (emitidos): matchea el codigo de las
      // facturas/notas que ya trajo el RCV (no crea DocumentoIh, ya vienen
      // del RCV con mas detalle) Y respalda su XML en linea.
      await recorrerPaginas(page, URL_EMI, "RUT_RECP", "mipeGesDocEmi", "", opciones.cargaInicial, desdeIso, async (filas) => {
        for (const fila of filas) {
          if (fila.codigo) codigosEmitidos.set(claveDocumento(fila.folio, fila.rut), fila.codigo);
          // Guias y boletas ya se respaldaron arriba, con pasadas dedicadas.
          if (fila.tipoTexto === "Guia de Despacho Electronica" || /^Boleta/.test(fila.tipoTexto)) continue;
          await intentarRespaldarEnLinea(page, fila, empresa, tipoDocumentoDesdeTexto(fila.tipoTexto), "venta", contextoRespaldo);
        }
      });

      // Recibidos: matchea codigo de compra Y respalda su PDF en linea.
      await recorrerPaginas(page, URL_RCP, "RUT_EMI", "mipeGesDocRcp", "", opciones.cargaInicial, desdeIso, async (filas) => {
        for (const fila of filas) {
          if (fila.codigo) codigosRecibidos.set(claveDocumento(fila.folio, fila.rut), fila.codigo);
          if (/^Boleta/.test(fila.tipoTexto)) continue; // ya se respaldo arriba
          await intentarRespaldarEnLinea(page, fila, empresa, tipoDocumentoDesdeTexto(fila.tipoTexto), "compra", contextoRespaldo);
        }
      });
    }

    if (!opciones.cargaInicial) {
      return {
        documentos: documentos.filter((d) => !d.fechaEmision || d.fechaEmision >= desdeIso),
        codigosEmitidos,
        codigosRecibidos,
        respaldos,
      };
    }
    return { documentos, codigosEmitidos, codigosRecibidos, respaldos };
  } finally {
    await browser.close();
  }
}

function tipoDocumentoDesdeTexto(tipoTexto: string): string {
  const mapa: Record<string, string> = {
    "Factura Electronica": "factura_afecta",
    "Factura Exenta Electronica": "factura_exenta",
    "Nota de Debito Electronica": "nota_debito",
    "Nota de Credito Electronica": "nota_credito",
    "Guia de Despacho Electronica": "guia_despacho",
    "Boleta Electronica": "boleta",
    "Boleta Exenta Electronica": "boleta",
  };
  return mapa[tipoTexto] ?? "factura_afecta"; // tipos no rastreados (43/46/110/111/112) no deberian llegar aqui
}
