import "server-only";
import { lanzarNavegador } from "./playwright-navegador";

// Scraper del Registro de Compras y Ventas (RCV) del SII para PERTEC SpA.
// No existe API publica para el RCV, asi que esto automatiza la misma
// navegacion que haria una persona: login con Clave Tributaria, elegir
// RUT/periodo, y descargar el CSV de "Detalles" por cada combinacion de
// pestana. Flujo validado a mano contra el sitio real antes de escribir esto
// (ver core/scripts/explorar-rcv.mjs para el script de descubrimiento).
//
// Hallazgo clave: VENTA no tiene sub-pestanas de estado (Registro/
// Pendientes/No Incluir/Reclamados) — esas solo existen en COMPRA, porque el
// acuse de recibo/reclamo es un concepto de quien recibe el documento, no de
// quien lo emite.
//
// Pero eso NO significa que una venta no tenga estado real: el cliente puede
// reclamar la factura dentro de los 8 dias corridos siguientes, y cuando lo
// hace el RCV lo registra como el EVENTO DEL RECEPTOR del documento.
//
// Ese evento es lo que se lee, y se aprendio a los golpes: la primera version
// derivo el estado de dos columnas de fecha ("Fecha Acuse Recibo" y "Fecha
// Reclamado") que se dieron por existentes sin haber visto un CSV real. Se
// releyeron tres periodos completos y las 174 filas guardadas quedaron con las
// dos fechas en NULL: esas columnas no vienen con esos nombres, o no vienen.
// Las fechas se siguen leyendo (si algun dia estan, es un dato mas), pero lo
// que decide es el evento del receptor, que es como el SII lo nombra en el
// modelo del DTE (ACD/ERM/RCD/RFP/RFT, ver EVENTOS_RECEPTOR).
//
// Y si no viene NINGUNA de las dos cosas, el estado de la venta queda en
// "registro" y quien pidio la relectura se entera: la accion devuelve las
// columnas que el CSV si trajo, en vez de informar "ninguna reclamada" —que es
// lo que hizo la primera version y parecia una respuesta—.

export type TipoDocumento = "compra" | "venta";
export type EstadoFactura = "registro" | "pendiente" | "no_incluir" | "reclamado" | "aceptado";

const SUBESTADOS_COMPRA: { etiquetaTab: string; estado: EstadoFactura }[] = [
  { etiquetaTab: "Registro", estado: "registro" },
  { etiquetaTab: "Pendientes", estado: "pendiente" },
  { etiquetaTab: "No Incluir", estado: "no_incluir" },
  { etiquetaTab: "Reclamados", estado: "reclamado" },
];

const CODIGOS_DTE_INCLUIDOS = [33, 34];

/**
 * El evento con que el receptor respondio al documento.
 *
 * Son los codigos del modelo de DTE del SII, y es la unica cosa del RCV de ventas que
 * dice si el cliente acepto o reclamo. "Reclamo" no es uno: son tres —al contenido, por
 * falta parcial y por falta total— y para Finanzas los tres significan lo mismo, que esa
 * factura no se cobra como esta.
 */
const EVENTOS_RECEPTOR: Record<string, "aceptado" | "reclamado"> = {
  ACD: "aceptado", // Acepta el contenido del documento
  ERM: "aceptado", // Otorga recibo de mercaderias o servicios
  RCD: "reclamado", // Reclamo al contenido del documento
  RFP: "reclamado", // Reclamo por falta parcial de mercaderias
  RFT: "reclamado", // Reclamo por falta total de mercaderias
};

/**
 * Lee la celda del evento, venga como codigo o como leyenda.
 *
 * El RCV la muestra a veces como "RFT", a veces como "RFT - Reclamo por Falta Total de
 * Mercaderias" y a veces solo con el texto. Se prueba el codigo primero y se cae al
 * texto: adivinar el formato exacto de una celda del SII es justo el error que trajo
 * hasta aca.
 */
function eventoReceptor(valor: string): "aceptado" | "reclamado" | null {
  const limpio = valor.trim();
  if (limpio === "") return null;
  const porCodigo = EVENTOS_RECEPTOR[limpio.slice(0, 3).toUpperCase()];
  if (porCodigo) return porCodigo;
  if (/reclam|rechaz/i.test(limpio)) return "reclamado";
  if (/acept|recibo|acuse/i.test(limpio)) return "aceptado";
  return null;
}

export interface FacturaSii {
  tipoDocumento: TipoDocumento;
  codigoDte: number;
  estado: EstadoFactura;
  rutContraparte: string;
  razonSocial: string | null;
  folio: number;
  fechaDocto: string | null; // YYYY-MM-DD
  fechaRecepcion: string | null; // ISO sin tz
  montoExento: number | null;
  montoNeto: number | null;
  montoIvaRecuperable: number | null;
  montoIvaNoRecuperable: number | null;
  montoTotal: number | null;
  periodo: string; // AAAAMM
  /** Cuando el receptor dio acuse de recibo. Solo en venta. YYYY-MM-DD. */
  fechaAcuse: string | null;
  /** Cuando el receptor RECLAMO el documento. Solo en venta. YYYY-MM-DD. */
  fechaReclamo: string | null;
}

export interface CredencialesSii {
  rutRepresentante: string;
  claveTributaria: string;
  rutEmpresa: string;
}

function limpiarRut(rut: string): string {
  const raw = rut.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
  return `${raw.slice(0, -1)}-${raw.slice(-1)}`;
}

function fechaDoctoAIso(fecha: string): string | null {
  const m = fecha.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo}-${d}`;
}

function fechaRecepcionAIso(fecha: string): string | null {
  const m = fecha.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m;
  // Sin offset de timezone explicito: aproximacion aceptable para un
  // dashboard interno donde importa el orden relativo, no el UTC exacto.
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function numeroONull(valor: string | undefined): number | null {
  if (valor === undefined || valor.trim() === "") return null;
  const n = Number(valor.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// El CSV que exporta el SII cambia levemente sus columnas segun la
// sub-pestana (por ejemplo "Pendientes" no trae "Fecha Acuse") y usa
// mayusculas/minusculas inconsistentes ("Monto Total" en compra, "Monto
// total" en venta) — por eso el parseo es por nombre de columna
// (case-insensitive), nunca por indice fijo.
//
// codigosIncluidos es un parametro (no siempre CODIGOS_DTE_INCLUIDOS) porque
// Facturas IH (lib/finanzas-ih/sii-rcv-ih.ts) reutiliza este parser pero
// necesita tambien notas de credito/debito (56/61), no solo factura
// afecta/exenta (33/34).
/**
 * Una fecha del RCV que puede venir sola o con hora, o vacia.
 *
 * Las columnas de acuse y reclamo aparecen a veces como "12/08/2026" y a veces
 * con hora. Y muchas filas las traen vacias, que es el caso normal: nadie
 * reclamo nada.
 */
function fechaSuelta(valor: string): string | null {
  const limpio = valor.trim();
  if (limpio === "") return null;
  return fechaDoctoAIso(limpio) ?? fechaRecepcionAIso(limpio)?.slice(0, 10) ?? null;
}

/**
 * El CSV del RCV a filas.
 *
 * Exportada porque es la parte PURA del scraper y la que se equivoco dos veces: sin
 * poder pasarle un CSV a mano, lo unico que se podia verificar era que el archivo
 * dijera ciertas palabras, y eso dio por buena una derivacion que en el SII real no
 * leia nada. Las pruebas ahora le pasan CSVs de ejemplo (scripts/probar-facturas-sii).
 */
export function parsearCsvRcv(
  contenido: string,
  tipoDocumento: TipoDocumento,
  estado: EstadoFactura,
  periodo: string,
  codigosIncluidos: number[] = CODIGOS_DTE_INCLUIDOS
): FacturaSii[] {
  const lineas = contenido.trim().split(/\r?\n/);
  if (lineas.length < 2) return [];

  const headers = lineas[0].split(";").map((h) => h.trim().toLowerCase());
  const idx = (...nombres: string[]): number => {
    for (const nombre of nombres) {
      const i = headers.indexOf(nombre.toLowerCase());
      if (i !== -1) return i;
    }
    return -1;
  };

  const iTipoDoc = idx("Tipo Doc");
  const iRut = idx("RUT Proveedor", "Rut cliente", "RUT Cliente");
  const iRazonSocial = idx("Razon Social");
  const iFolio = idx("Folio");
  const iFechaDocto = idx("Fecha Docto");
  const iFechaRecepcion = idx("Fecha Recepcion");
  const iMontoExento = idx("Monto Exento");
  const iMontoNeto = idx("Monto Neto");
  const iMontoIvaRecuperable = idx("Monto IVA Recuperable", "Monto IVA");
  const iMontoIvaNoRecuperable = idx("Monto Iva No Recuperable");
  const iMontoTotal = idx("Monto Total", "Monto total");
  // Lo que dice el estado real de una venta. El evento del receptor es el que manda;
  // las fechas son un dato extra que puede no venir (y hoy no viene). Si ninguna de
  // las tres columnas esta, idx() devuelve -1 y el estado queda en "registro".
  const iEvento = idx(
    "Evento Receptor",
    "Estado Evento Receptor",
    "Codigo Evento Receptor",
    "Evento del Receptor",
    "Estado Acuse",
    "Acuse Recibo",
    "Estado DTE",
  );
  const iFechaAcuse = idx("Fecha Acuse Recibo", "Fecha Acuse", "Fecha de Acuse Recibo");
  const iFechaReclamo = idx("Fecha Reclamado", "Fecha Reclamo", "Fecha de Reclamo");

  const filas: FacturaSii[] = [];
  for (const linea of lineas.slice(1)) {
    if (!linea.trim()) continue;
    const cols = linea.split(";");
    const codigoDte = Number(cols[iTipoDoc]);
    if (!codigosIncluidos.includes(codigoDte)) continue;

    const folio = Number(cols[iFolio]);
    if (!Number.isFinite(folio)) continue;

    const fechaAcuse = iFechaAcuse !== -1 ? fechaSuelta(cols[iFechaAcuse] || "") : null;
    const fechaReclamo = iFechaReclamo !== -1 ? fechaSuelta(cols[iFechaReclamo] || "") : null;
    const evento = iEvento !== -1 ? eventoReceptor(cols[iEvento] || "") : null;

    filas.push({
      tipoDocumento,
      codigoDte,
      // En compra el estado es la sub-pestana de la que se bajo el CSV. En venta
      // no hay sub-pestanas: lo dice el evento del receptor (y la fecha de reclamo,
      // si viniera), y el RECLAMO MANDA —un documento reclamado y despues acusado
      // sigue reclamado hasta que el cliente lo revierta, y es el que hay que ir a
      // mirar—.
      estado:
        tipoDocumento === "venta"
          ? fechaReclamo || evento === "reclamado"
            ? "reclamado"
            : fechaAcuse || evento === "aceptado"
              ? "aceptado"
              : estado
          : estado,
      rutContraparte: (cols[iRut] || "").trim(),
      razonSocial: (cols[iRazonSocial] || "").trim() || null,
      folio,
      fechaDocto: iFechaDocto !== -1 ? fechaDoctoAIso(cols[iFechaDocto] || "") : null,
      fechaRecepcion: iFechaRecepcion !== -1 ? fechaRecepcionAIso(cols[iFechaRecepcion] || "") : null,
      montoExento: numeroONull(cols[iMontoExento]),
      montoNeto: numeroONull(cols[iMontoNeto]),
      montoIvaRecuperable: numeroONull(cols[iMontoIvaRecuperable]),
      montoIvaNoRecuperable: numeroONull(cols[iMontoIvaNoRecuperable]),
      montoTotal: numeroONull(cols[iMontoTotal]),
      periodo,
      fechaAcuse,
      fechaReclamo,
    });
  }
  return filas;
}

// --- Playwright: navegador segun entorno -----------------------------------
// (extraído a lib/playwright-navegador.ts para reutilizarlo fuera de este scraper)

// Exportada para que lib/finanzas-ih/sii-rcv-ih.ts pueda loguearse una sola
// vez y despues consultar el RCV de varias empresas (IH, IL) en la misma
// sesion, en vez de logearse una vez por empresa.
export async function login(page: import("playwright-core").Page, creds: CredencialesSii): Promise<void> {
  await page.goto(
    "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html" +
      "?https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION%3D2%26TIPO%3D4",
    { timeout: 40000 }
  );
  await page.waitForSelector("#rutcntr", { timeout: 20000 });
  await page.locator("#rutcntr").fill(limpiarRut(creds.rutRepresentante));
  await page.locator("#rutcntr").blur();
  await page.locator("#clave").fill(creds.claveTributaria);
  await page.locator("#bt_ingresar").click();
  // No esperamos "networkidle": el destino inmediato despues del login (la
  // pagina del RCV) se navega explicitamente con goto() en consultarPeriodo,
  // asi que solo necesitamos tiempo suficiente para que, si el login fallo,
  // el mensaje de error ya este en el HTML.
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});

  const body = (await page.innerText("body")).toLowerCase();
  if (["clave incorrecta", "rut incorrecto", "acceso no autorizado"].some((s) => body.includes(s))) {
    throw new Error("Login SII fallido: RUT o clave tributaria incorrectos.");
  }
}

// El SPA del RCV a veces muestra un modal de aviso (Bootstrap, id
// "alert-modal") que queda tapando la pantalla e intercepta cualquier click
// -- confirmado en vivo en produccion (GitHub Actions, 2026-08-14): el click
// en la pestana VENTA fallaba con "<div id="alert-modal" ...> intercepts
// pointer events". Se cierra ANTES de cada click de pestana, no solo una vez,
// porque puede reaparecer en cualquier momento del flujo.
async function cerrarModalSiExiste(page: import("playwright-core").Page): Promise<void> {
  const modal = page.locator("#alert-modal.in, .modal.in").first();
  if ((await modal.count()) === 0) return;

  const cerrar = modal.locator("button.close, [data-dismiss='modal']").first();
  if ((await cerrar.count()) > 0) {
    await cerrar.click({ timeout: 3000 }).catch(() => {});
  } else {
    await page.keyboard.press("Escape").catch(() => {});
  }
  await page.waitForTimeout(300);
}

async function irATab(page: import("playwright-core").Page, texto: string): Promise<void> {
  await cerrarModalSiExiste(page);
  const tab = page.locator("a, li").filter({ hasText: new RegExp(`^${texto}$`, "i") }).first();
  await tab.scrollIntoViewIfNeeded();
  await tab.click({ timeout: 10000 });
  // Es una SPA: el clic solo cambia estado local (no hay navegacion ni
  // llamadas de red que "idle-ar"), así que un delay corto y fijo alcanza
  // para que Angular vuelva a renderizar.
  await page.waitForTimeout(500);
}

/**
 * Que columnas trajo un CSV del SII.
 *
 * No es telemetria: es la unica forma de que un cambio de columnas del RCV se pueda
 * ver desde la pantalla en vez de deducirlo. Van los NOMBRES, nunca los valores.
 */
export interface ColumnasDelCsv {
  tipoDocumento: TipoDocumento;
  estado: EstadoFactura;
  columnas: string[];
}

async function descargarDetalle(
  page: import("playwright-core").Page,
  tipoDocumento: TipoDocumento,
  estado: EstadoFactura,
  periodo: string,
  codigosIncluidos: number[],
  alLeerCsv?: (info: ColumnasDelCsv) => void
): Promise<FacturaSii[]> {
  const btn = page.locator("button, a").filter({ hasText: /descargar detalles/i });
  if ((await btn.count()) === 0) return []; // sin boton = 0 documentos en esa pestana

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    btn.first().click(),
  ]);
  const streamPath = await download.path();
  if (!streamPath) return [];
  const fs = await import("node:fs/promises");
  const contenido = await fs.readFile(streamPath, "utf-8");
  const cabecera = contenido.trim().split(/\r?\n/)[0] ?? "";
  alLeerCsv?.({ tipoDocumento, estado, columnas: cabecera.split(";").map((c) => c.trim()) });
  return parsearCsvRcv(contenido, tipoDocumento, estado, periodo, codigosIncluidos);
}

// Consulta un periodo (AAAAMM) completo: todas las sub-pestanas de compra +
// venta. periodoMes/periodoAnio van en formato SII ("07", "2026").
//
// Exportada (con codigosIncluidos parametrizable) para que Facturas IH pueda
// pedir tambien notas de credito/debito (56/61), no solo factura afecta/
// exenta (33/34) como el RCV clasico de PERTEC SpA.
export async function consultarPeriodo(
  page: import("playwright-core").Page,
  rutEmpresa: string,
  periodoMes: string,
  periodoAnio: string,
  codigosIncluidos: number[] = CODIGOS_DTE_INCLUIDOS,
  alLeerCsv?: (info: ColumnasDelCsv) => void
): Promise<FacturaSii[]> {
  await page.goto("https://www4.sii.cl/consdcvinternetui/#/index", { timeout: 40000 });
  // Esta SPA nunca llega a "networkidle" (sigue con llamadas de fondo), asi
  // que esperamos directo al elemento que necesitamos en vez de quemar el
  // presupuesto de tiempo de la funcion serverless esperando algo que no va
  // a pasar.
  await page.waitForSelector("select[name='rut']", { timeout: 30000 });

  await page.locator("select[name='rut']").selectOption(limpiarRut(rutEmpresa));
  await page.locator("select#periodoMes").selectOption(periodoMes);
  await page.locator("select").nth(2).selectOption(periodoAnio);

  const btnConsultar = page.locator("button, input[type='submit']").filter({ hasText: /consultar/i });
  await btnConsultar.first().click();
  await page
    .locator("a, li")
    .filter({ hasText: /^COMPRA$/i })
    .first()
    .waitFor({ timeout: 25000 });
  await page.waitForTimeout(500);

  const periodo = `${periodoAnio}${periodoMes}`;
  const filas: FacturaSii[] = [];

  await irATab(page, "COMPRA");
  for (const { etiquetaTab, estado } of SUBESTADOS_COMPRA) {
    try {
      await irATab(page, etiquetaTab);
      filas.push(
        ...(await descargarDetalle(page, "compra", estado, periodo, codigosIncluidos, alLeerCsv))
      );
    } catch {
      // Sub-pestana sin datos o no disponible ese periodo: se ignora.
    }
  }

  await irATab(page, "VENTA");
  filas.push(
    ...(await descargarDetalle(page, "venta", "registro", periodo, codigosIncluidos, alLeerCsv))
  );

  return filas;
}

export interface OpcionesExtraccion {
  // Si es true, trae todo el periodo actual sin filtrar por fecha (carga
  // inicial). Si es false, filtra a los ultimos `ventanaDias` dias por
  // fecha_docto, consultando tambien el periodo anterior si la ventana cruza
  // el limite de mes.
  cargaInicial: boolean;
  ventanaDias?: number;
  /**
   * Periodos completos a releer ("2026-08"), sin filtrar por dia.
   *
   * Existe por un agujero que se vio al agregar el estado real de las ventas: la
   * sincronizacion incremental solo mira los ultimos dias, asi que una factura
   * mas vieja que la ventana NUNCA vuelve a consultarse y se queda con el estado
   * que tenia el dia que se leyo. Al cambiar como se deriva el estado, o al
   * agregar una columna, eso deja el historial congelado en un dato viejo.
   *
   * Con esto se pide "releeme agosto entero" y el estado de todo ese periodo se
   * actualiza contra el SII. Es la unica forma de que un cambio de este archivo
   * alcance a lo ya guardado.
   */
  periodos?: string[];
  /**
   * Se llama con las columnas de cada CSV que se baja.
   *
   * Para que quien pidio la relectura pueda VER que trajo el SII cuando el estado no
   * sale de ahi. Sin esto, un cambio de columnas del RCV se ve como "ninguna venta
   * reclamada", que suena a respuesta y no lo es.
   */
  alLeerCsv?: (info: ColumnasDelCsv) => void;
}

export async function extraerFacturasSii(
  creds: CredencialesSii,
  opciones: OpcionesExtraccion
): Promise<FacturaSii[]> {
  // 15 dias, no 7: el cliente tiene 8 dias corridos para reclamar una factura,
  // asi que con una ventana de 7 un reclamo del octavo dia caia justo afuera y
  // el panel se quedaba con el estado viejo para siempre. Quince deja margen
  // para el fin de semana largo y para un dia que el cron no corrio.
  const ventanaDias = opciones.ventanaDias ?? 15;
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - ventanaDias);

  const relectura = (opciones.periodos ?? []).filter((p) => /^\d{4}-\d{2}$/.test(p));
  const periodos = new Set<string>(relectura);
  if (relectura.length === 0) {
    periodos.add(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`);
    // La relectura de periodos completos NO filtra por dia: se pide justamente para
    // actualizar el estado de lo que ya es mas viejo que la ventana.
    if (!opciones.cargaInicial && relectura.length === 0) {
      periodos.add(`${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, "0")}`);
    }
  }

  const browser = await lanzarNavegador();
  try {
    const page = await browser.newPage();
    await login(page, creds);

    let filas: FacturaSii[] = [];
    for (const periodo of periodos) {
      const [anio, mes] = periodo.split("-");
      filas = filas.concat(
        await consultarPeriodo(
          page,
          creds.rutEmpresa,
          mes,
          anio,
          CODIGOS_DTE_INCLUIDOS,
          opciones.alLeerCsv
        )
      );
    }

    if (!opciones.cargaInicial) {
      const desdeIso = desde.toISOString().slice(0, 10);
      filas = filas.filter((f) => !f.fechaDocto || f.fechaDocto >= desdeIso);
    }

    return filas;
  } finally {
    await browser.close();
  }
}
