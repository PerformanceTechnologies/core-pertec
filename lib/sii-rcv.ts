import "server-only";

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
// quien lo emite. Para venta el estado siempre es "registro".

export type TipoDocumento = "compra" | "venta";
export type EstadoFactura = "registro" | "pendiente" | "no_incluir" | "reclamado";

const SUBESTADOS_COMPRA: { etiquetaTab: string; estado: EstadoFactura }[] = [
  { etiquetaTab: "Registro", estado: "registro" },
  { etiquetaTab: "Pendientes", estado: "pendiente" },
  { etiquetaTab: "No Incluir", estado: "no_incluir" },
  { etiquetaTab: "Reclamados", estado: "reclamado" },
];

const CODIGOS_DTE_INCLUIDOS = [33, 34];

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
function parsearCsvRcv(
  contenido: string,
  tipoDocumento: TipoDocumento,
  estado: EstadoFactura,
  periodo: string
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

  const filas: FacturaSii[] = [];
  for (const linea of lineas.slice(1)) {
    if (!linea.trim()) continue;
    const cols = linea.split(";");
    const codigoDte = Number(cols[iTipoDoc]);
    if (!CODIGOS_DTE_INCLUIDOS.includes(codigoDte)) continue;

    const folio = Number(cols[iFolio]);
    if (!Number.isFinite(folio)) continue;

    filas.push({
      tipoDocumento,
      codigoDte,
      estado,
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
    });
  }
  return filas;
}

// --- Playwright: navegador segun entorno -----------------------------------

async function lanzarNavegador() {
  if (process.env.VERCEL) {
    // @sparticuz/chromium-min solo extrae las librerias de sistema que le
    // faltan al runtime de Vercel (libnss3.so y otras, empaquetadas en
    // al2023.tar.br) si detecta que corre "en AWS Lambda" via esta variable
    // — Vercel no la setea sola, aunque su runtime este basado en Lambda.
    process.env.AWS_LAMBDA_JS_RUNTIME ??= "nodejs20.x";

    const chromium = (await import("@sparticuz/chromium-min")).default;
    const { chromium: playwrightChromium } = await import("playwright-core");
    const executablePath = await chromium.executablePath(
      process.env.CHROMIUM_PACK_URL ||
        "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar"
    );
    return playwrightChromium.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });
  }
  // Desarrollo local: usa el paquete "playwright" completo (chromium ya
  // instalado via `npx playwright install chromium`).
  const { chromium: localChromium } = await import("playwright");
  return localChromium.launch({ headless: true });
}

async function login(page: import("playwright-core").Page, creds: CredencialesSii): Promise<void> {
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
  await page.waitForLoadState("networkidle", { timeout: 30000 });

  const body = (await page.innerText("body")).toLowerCase();
  if (["clave incorrecta", "rut incorrecto", "acceso no autorizado"].some((s) => body.includes(s))) {
    throw new Error("Login SII fallido: RUT o clave tributaria incorrectos.");
  }
}

async function irATab(page: import("playwright-core").Page, texto: string): Promise<void> {
  const tab = page.locator("a, li").filter({ hasText: new RegExp(`^${texto}$`, "i") }).first();
  await tab.scrollIntoViewIfNeeded();
  await tab.click({ timeout: 10000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function descargarDetalle(
  page: import("playwright-core").Page,
  tipoDocumento: TipoDocumento,
  estado: EstadoFactura,
  periodo: string
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
  return parsearCsvRcv(contenido, tipoDocumento, estado, periodo);
}

// Consulta un periodo (AAAAMM) completo: todas las sub-pestanas de compra +
// venta. periodoMes/periodoAnio van en formato SII ("07", "2026").
async function consultarPeriodo(
  page: import("playwright-core").Page,
  rutEmpresa: string,
  periodoMes: string,
  periodoAnio: string
): Promise<FacturaSii[]> {
  await page.goto("https://www4.sii.cl/consdcvinternetui/#/index", { timeout: 40000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(1500);

  await page.locator("select[name='rut']").selectOption(limpiarRut(rutEmpresa));
  await page.locator("select#periodoMes").selectOption(periodoMes);
  await page.locator("select").nth(2).selectOption(periodoAnio);

  const btnConsultar = page.locator("button, input[type='submit']").filter({ hasText: /consultar/i });
  await btnConsultar.first().click();
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.waitForTimeout(1200);

  const periodo = `${periodoAnio}${periodoMes}`;
  const filas: FacturaSii[] = [];

  await irATab(page, "COMPRA");
  for (const { etiquetaTab, estado } of SUBESTADOS_COMPRA) {
    try {
      await irATab(page, etiquetaTab);
      filas.push(...(await descargarDetalle(page, "compra", estado, periodo)));
    } catch {
      // Sub-pestana sin datos o no disponible ese periodo: se ignora.
    }
  }

  await irATab(page, "VENTA");
  filas.push(...(await descargarDetalle(page, "venta", "registro", periodo)));

  return filas;
}

export interface OpcionesExtraccion {
  // Si es true, trae todo el periodo actual sin filtrar por fecha (carga
  // inicial). Si es false, filtra a los ultimos `ventanaDias` dias por
  // fecha_docto, consultando tambien el periodo anterior si la ventana cruza
  // el limite de mes.
  cargaInicial: boolean;
  ventanaDias?: number;
}

export async function extraerFacturasSii(
  creds: CredencialesSii,
  opciones: OpcionesExtraccion
): Promise<FacturaSii[]> {
  const ventanaDias = opciones.ventanaDias ?? 7;
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - ventanaDias);

  const periodos = new Set<string>();
  periodos.add(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`);
  if (!opciones.cargaInicial) {
    periodos.add(`${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, "0")}`);
  }

  const browser = await lanzarNavegador();
  try {
    const page = await browser.newPage();
    await login(page, creds);

    let filas: FacturaSii[] = [];
    for (const periodo of periodos) {
      const [anio, mes] = periodo.split("-");
      filas = filas.concat(await consultarPeriodo(page, creds.rutEmpresa, mes, anio));
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
