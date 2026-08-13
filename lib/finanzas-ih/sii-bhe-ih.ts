import "server-only";
import { lanzarNavegador } from "../playwright-navegador";
import { subirArchivoIh } from "./sharepoint-ih";
import type { DocumentoIh } from "./sii-rcv-ih";
import type { RespaldoDocumento } from "./finanzas-ih";
import { claveDocumento } from "./claves";

// Boletas de Honorarios Electronicas (BHE) recibidas por IH: viven en un
// sistema del SII COMPLETAMENTE DISTINTO del Portal MIPYME que usa el resto
// de Facturas IH (loa.sii.cl, no www1.sii.cl/Portal001), y esa app no
// reconoce la sesion "actuando por representacion" -- exige loguearse
// DIRECTO con el RUT y clave propios de la empresa (SII_CLAVE_EMPRESA_IH),
// no con el representante+clave tributaria del resto del modulo. Por eso
// vive en su propio archivo con su propio login, en vez de reusar
// lib/sii-rcv.ts. Solo IH por ahora (no hay SII_CLAVE_EMPRESA_IL).
//
// No es un DTE (no tiene codigo de tipo de documento electronico real del
// SII) -- se usa 0 como valor de codigo_dte, documentado aca, no un codigo
// que pueda confundirse con uno real.
const CODIGO_DTE_BOLETA_HONORARIOS = 0;

const URL_LOGIN_MISIIR =
  "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?https://misiir.sii.cl/cgi_misii/siihome.cgi";
const URL_MENU = "https://loa.sii.cl/cgi_IMT/TMBCOC_MenuConsultasContribRec.cgi";

function limpiarRut(rut: string): string {
  const raw = rut.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
  return `${raw.slice(0, -1)}-${raw.slice(-1)}`;
}

// "03/08/2026" -> "2026-08-03"
function fechaBheAIso(fecha: string): string | null {
  const m = fecha.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

interface FilaBhe {
  nroBoleta: number;
  rutEmisor: string;
  nombreEmisor: string;
  fecha: string;
  totalHonorarios: number;
  retencion: number;
  liquido: number;
  codigoBarras: string;
  codComuna: string;
}

async function login(page: import("playwright-core").Page, rutEmpresa: string, clave: string): Promise<void> {
  await page.goto(URL_LOGIN_MISIIR, { timeout: 40000 });
  await page.waitForSelector("#rutcntr", { timeout: 20000 });
  await page.locator("#rutcntr").fill(limpiarRut(rutEmpresa));
  await page.locator("#rutcntr").blur();
  await page.locator("#clave").fill(clave);
  await page.locator("#bt_ingresar").click();
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

  const body = (await page.innerText("body").catch(() => "")).toLowerCase();
  if (["clave incorrecta", "rut incorrecto", "acceso no autorizado"].some((s) => body.includes(s))) {
    throw new Error("Login BHE IH fallido: RUT o clave incorrectos (SII_CLAVE_EMPRESA_IH).");
  }
}

// El menu se genera con document.write() con HTML mal anidado: los
// <select>/<input> quedan como hermanos del <form>, no hijos -- hay que
// ubicarlos por atributo en todo el documento. El boton "Consultar" no es un
// submit real, dispara presionaBoton('validar_mensual_rec').
async function consultarMes(page: import("playwright-core").Page, mes: string, anio: string): Promise<FilaBhe[]> {
  await page.goto(URL_MENU, { timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  await page.locator("select[name='cbmesinformemensual']").selectOption(mes);
  await page.locator("select[name='cbanoinformemensual']").selectOption(anio);
  await page.locator("input[onclick*='validar_mensual_rec']").first().click();
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);

  const datos = await page.evaluate(() => ({
    // xml_values / arr_informe_mensual son Array() con claves de texto, no
    // indices numericos -- JSON.stringify de un Array normal se queda solo
    // con los indices, hay que copiarlos a un objeto plano.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    xmlValues: { ...(window as any).xml_values },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filas: (window as any).CantidadFilas as number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arr: { ...(window as any).arr_informe_mensual },
  }));

  // Los montos vienen formateados con punto de miles (ej. "457.847"): hay
  // que sacarlo antes de Number(), o "457.847" se lee como 457.847 (decimal).
  const montoBhe = (valor: string | undefined): number => Number((valor ?? "0").replace(/\./g, "")) || 0;

  const filas: FilaBhe[] = [];
  for (let i = 1; i <= (datos.filas ?? 0); i++) {
    const arr = datos.arr as Record<string, string>;
    filas.push({
      nroBoleta: Number(arr[`nroboleta_${i}`]),
      rutEmisor: `${arr[`rutemisor_${i}`]}-${arr[`dvemisor_${i}`]}`,
      nombreEmisor: (arr[`nombre_emisor_${i}`] ?? "").trim(),
      fecha: arr[`fecha_boleta_${i}`],
      totalHonorarios: montoBhe(arr[`totalhonorarios_${i}`]),
      retencion: montoBhe(arr[`retencion_receptor_${i}`]),
      liquido: montoBhe(arr[`honorariosliquidos_${i}`]),
      codigoBarras: arr[`codigobarras_${i}`],
      codComuna: arr[`cod_comuna_${i}`],
    });
  }
  return filas;
}

// ObtenerBoletaPdf() del SII hace un submit de pagina completa (no XHR): no
// es confiable leer el body de esa navegacion. En vez de eso, se le pide al
// navegador que calcule txt_cod_39 (Code39(...)) y txt_descr_comuna
// (obtieneComuna(...)) con sus propias funciones JS (evita reimplementar el
// algoritmo de codificacion Code39), y se hace el POST aparte con
// page.request (misma sesion/cookies) para leer la respuesta directo.
async function descargarPdfBhe(page: import("playwright-core").Page, fila: FilaBhe): Promise<Buffer | null> {
  const { cod39, comunaDesc } = await page.evaluate(
    ({ cb, cc }) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cod39: (window as any).Code39(cb, 0),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      comunaDesc: (window as any).obtieneComuna(cc),
    }),
    { cb: fila.codigoBarras, cc: fila.codComuna }
  );

  const respuesta = await page.request.post("https://loa.sii.cl/cgi_IMT/TMBCOT_ConsultaBoletaPdf.cgi", {
    form: {
      origen: "RECIBIDOS",
      txt_codigobarras: fila.codigoBarras,
      veroriginal: "si",
      txt_cod_39: cod39,
      txt_descr_comuna: comunaDesc,
      nro_boleta: "0",
    },
  });
  if (!respuesta.ok()) return null;
  const buffer = await respuesta.body();
  return buffer.length > 500 ? buffer : null; // por debajo de eso es casi seguro una pagina de error, no un PDF real
}

export interface OpcionesBheIh {
  cargaInicial: boolean;
  // Documentos que YA tienen su PDF en SharePoint (claveDocumento) -- se
  // saltan el respaldo en linea para no volver a pedirlos cada corrida.
  yaRespaldados: Set<string>;
  limiteRespaldo: number;
}

export interface ResultadoBheIh {
  documentos: DocumentoIh[];
  respaldos: Map<string, RespaldoDocumento>;
}

// En carga inicial retrocede mes a mes hasta encontrar 2 meses vacios
// seguidos (salvavidas de 36 meses = 3 anios, mas que suficiente: BHE
// electronica es reciente en Chile). En corridas normales solo pide el mes
// actual -- una boleta de honorarios, una vez emitida, no cambia.
const MESES_MAXIMO_CARGA_INICIAL = 36;

export async function extraerBoletasHonorariosIh(opciones: OpcionesBheIh): Promise<ResultadoBheIh> {
  const rutIh = process.env.SII_RUT_EMPRESA_IH ?? "";
  const claveIh = process.env.SII_CLAVE_EMPRESA_IH;
  if (!rutIh || !claveIh) {
    // Feature apagada mientras no se configure la clave propia de IH.
    return { documentos: [], respaldos: new Map() };
  }

  const browser = await lanzarNavegador();
  try {
    const page = await browser.newPage();
    await login(page, rutIh, claveIh);

    const documentos: DocumentoIh[] = [];
    const respaldos = new Map<string, RespaldoDocumento>();

    const hoy = new Date();
    let mesesVaciosSeguidos = 0;
    const tope = opciones.cargaInicial ? MESES_MAXIMO_CARGA_INICIAL : 1;

    for (let i = 0; i < tope; i++) {
      const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const mes = String(fecha.getMonth() + 1).padStart(2, "0");
      const anio = String(fecha.getFullYear());

      const filas = await consultarMes(page, mes, anio);
      if (filas.length === 0) {
        mesesVaciosSeguidos++;
        if (opciones.cargaInicial && mesesVaciosSeguidos >= 2) break;
        continue;
      }
      mesesVaciosSeguidos = 0;

      for (const fila of filas) {
        const fechaEmision = fechaBheAIso(fila.fecha);
        documentos.push({
          empresa: "IH",
          tipoDocumento: "boleta_honorarios",
          direccion: "compra",
          codigoDte: CODIGO_DTE_BOLETA_HONORARIOS,
          estadoSii: null,
          rutContraparte: fila.rutEmisor,
          razonSocialContraparte: fila.nombreEmisor || null,
          folio: fila.nroBoleta,
          fechaEmision,
          montoExento: null,
          montoNeto: fila.totalHonorarios, // honorarios brutos
          montoIva: fila.retencion, // retencion (reusa la columna, no es IVA)
          montoTotal: fila.liquido, // honorarios liquidos (pagados)
          periodo: `${anio}${mes}`,
          fuente: "portal_mipyme" as const,
          codigoPortal: fila.codigoBarras,
        });

        const clave = claveDocumento(fila.nroBoleta, fila.rutEmisor);
        if (opciones.yaRespaldados.has(clave) || respaldos.has(clave)) continue;
        if (respaldos.size >= opciones.limiteRespaldo) continue;

        try {
          const pdf = await descargarPdfBhe(page, fila);
          if (!pdf) continue;
          const fechaParaRuta = fechaEmision ? new Date(fechaEmision) : fecha;
          const subida = await subirArchivoIh(
            "IH",
            "boleta_honorarios",
            fechaParaRuta.getFullYear(),
            fechaParaRuta.getMonth() + 1,
            `${fila.nroBoleta}.pdf`,
            pdf
          );
          respaldos.set(clave, { pdfSharepointItemId: subida.itemId, pdfSharepointWebUrl: subida.webUrl });
        } catch (err) {
          console.error(`[sii-bhe-ih] respaldo boleta ${fila.nroBoleta}:`, err);
        }
      }
    }

    return { documentos, respaldos };
  } finally {
    await browser.close();
  }
}
