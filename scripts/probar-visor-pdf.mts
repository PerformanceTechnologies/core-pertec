/**
 * El visor de comprobantes: que la barra lateral no lo tape, y que el PDF se dibuje.
 *
 * Correr con:  npm run probar-visor
 *
 * El reclamo era "al abrir un pdf se ve así de mal": el visor aparecía con la barra
 * lateral encima, con el nombre del archivo cortado por la izquierda y el pie de las
 * teclas partido, y adentro el visor del navegador con su barra en inglés ("Automatic
 * Zoom", "of 1") y sus grises, que dentro de un modal del core se leía como otra
 * aplicación pegada.
 *
 * Las dos cosas se prueban acá porque ninguna se ve leyendo el archivo:
 *
 *  1. Que el visor quede ARRIBA de la barra: se monta dentro de un contenedor con
 *     `transform`, que es la trampa real —un ancestro transformado hace que `fixed` deje
 *     de referirse a la ventana y pase a referirse a ese contenedor, así que el visor se
 *     encierra en el área de contenido en vez de tapar la pantalla— y se pregunta al
 *     navegador, con elementFromPoint, QUIÉN está arriba en el punto donde está la barra.
 *     Con el portal a document.body contesta el visor; sin él, la barra.
 *  2. Que pdf.js dibuje: se imprime un PDF de verdad con Chromium, se sirve, y se
 *     comprueba que aparece el canvas, que la barra propia dice "1 de 1" en español y que
 *     el zoom cambia el ancho dibujado.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { chromium } from "playwright";
import { BARRA_FIJA } from "../lib/estilos";

const carpeta = mkdtempSync(join(tmpdir(), "visor-pdf-"));

execFileSync("npx", ["@tailwindcss/cli", "-i", "app/globals.css", "-o", join(carpeta, "estilos.css")], {
  stdio: "pipe",
});

// `next/dynamic` de mentira: carga el módulo con React.lazy y su propio Suspense.
writeFileSync(
  join(carpeta, "dinamico.ts"),
  `import { lazy, Suspense, createElement } from "react";
   export default function dynamic(cargar: () => Promise<any>) {
     const Perezoso = lazy(() => cargar().then((m: any) => ({ default: m.default ?? m })));
     return (props: any) => createElement(Suspense, { fallback: null }, createElement(Perezoso, props));
   }`,
);

// El layout de verdad, en lo que importa: la barra lateral con SUS clases reales
// (importadas de lib/estilos.ts, no copiadas) y el contenido dentro de un contenedor
// transformado, que es la condición que rompía el `fixed` del visor.
writeFileSync(
  join(carpeta, "entrada.tsx"),
  `
import { createRoot } from "react-dom/client";
import VisorComprobante from "${process.cwd()}/components/rendidor/VisorComprobante";
import { BARRA_FIJA } from "${process.cwd()}/lib/estilos";

createRoot(document.getElementById("raiz")!).render(
  <div className="min-h-screen">
    <aside id="barra" className={BARRA_FIJA + " border-r border-borde bg-crema"}>
      <p className="p-4 text-sm font-bold">CORE PERTEC</p>
    </aside>
    {/* El contenedor transformado: la trampa. */}
    <main id="contenido" style={{ transform: "translateZ(0)" }} className="pl-[296px] py-8">
      <p>Contenido de la página, detrás del visor.</p>
      <VisorComprobante
        comprobante={{ url: "/comprobante.pdf", nombre: "e2e5f8ad-9b42-498e-8a01-ba3fc572b482.pdf", esPdf: true }}
        onCerrar={() => { (window as any).cerrado = true; }}
      />
    </main>
  </div>,
);
`,
);

const { outputFiles } = await esbuild.build({
  entryPoints: [join(carpeta, "entrada.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  write: false,
  // Con outdir esbuild puede emitir el CSS que importa react-pdf (la capa de texto) como
  // un archivo aparte en vez de fallar con "without an output path configured".
  outdir: carpeta,
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".tsx": "tsx", ".ts": "ts", ".css": "css" },
  absWorkingDir: process.cwd(),
  nodePaths: [join(process.cwd(), "node_modules")],
  alias: { "next/dynamic": join(carpeta, "dinamico.ts") },
});
for (const salida of outputFiles) {
  // esbuild deja el JS y, aparte, el CSS que importa react-pdf para la capa de texto.
  writeFileSync(join(carpeta, salida.path.endsWith(".css") ? "visor.css" : "visor.js"), salida.text);
}

// Un PDF de verdad, impreso por Chromium: probar el visor con un PDF inventado a mano no
// prueba nada, porque pdf.js lo rechazaría.
const paraImprimir = await chromium.launch({ headless: true });
const hoja = await paraImprimir.newPage();
await hoja.setContent("<h1>BOLETA DE HONORARIOS</h1><p>Derechos de inscripción CBRS · $2.300</p>");
const pdf = await hoja.pdf({ format: "A4" });
await paraImprimir.close();

writeFileSync(
  join(carpeta, "index.html"),
  `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="estilos.css"><link rel="stylesheet" href="visor.css"></head>
<body class="bg-crema text-tinta"><div id="raiz"></div>
<script src="visor.js"></script></body></html>`,
);

const navegador = await chromium.launch({ headless: true });
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
const errores: string[] = [];
pagina.on("pageerror", (e) => errores.push(e.message));

const ORIGEN = "http://visor.local";
const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".pdf": "application/pdf",
};
await pagina.route(`${ORIGEN}/**`, (ruta) => {
  const nombre = new URL(ruta.request().url()).pathname.replace(/^\//, "") || "index.html";
  const tipo = TIPOS[nombre.slice(nombre.lastIndexOf("."))];
  if (nombre === "comprobante.pdf") {
    return ruta.fulfill({ status: 200, contentType: "application/pdf", body: pdf });
  }
  // El worker de pdf.js sale de public/, igual que en la app.
  if (nombre.startsWith("pdfjs/")) {
    return ruta.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: readFileSync(join(process.cwd(), "public", nombre)),
    });
  }
  if (!tipo) return ruta.fulfill({ status: 200, contentType: "text/plain", body: "" });
  return ruta.fulfill({ status: 200, contentType: tipo, body: readFileSync(join(carpeta, nombre)) });
});
await pagina.goto(`${ORIGEN}/index.html`);
await pagina.waitForSelector('[role="dialog"]');

// ── 1. La barra lateral no tapa el visor ─────────────────────────────────
assert.ok(BARRA_FIJA.includes("fixed"), "la barra sigue siendo fija: si no, esta prueba mide otra cosa");

const arriba = await pagina.evaluate(() => {
  const barra = document.getElementById("barra")!.getBoundingClientRect();
  // Un punto bien adentro de la barra, a media altura.
  const encima = document.elementFromPoint(barra.width / 2, window.innerHeight / 2)!;
  const dialogo = document.querySelector('[role="dialog"]')!;
  return {
    anchoBarra: barra.width,
    esDelVisor: dialogo.contains(encima) || dialogo === encima,
    // Y que el visor cubra la ventana ENTERA, no solo el área de contenido.
    cajaDelVisor: dialogo.getBoundingClientRect().toJSON(),
    ventana: { ancho: window.innerWidth, alto: window.innerHeight },
    // El portal: el visor tiene que ser hijo del body, no del contenedor transformado.
    padre: dialogo.parentElement?.tagName ?? "",
    dentroDelContenido: document.getElementById("contenido")!.contains(dialogo),
  };
});

assert.ok(arriba.anchoBarra > 200, `la barra mide ${arriba.anchoBarra}px: la prueba necesita una barra real`);
assert.equal(
  arriba.esDelVisor,
  true,
  "en el punto donde está la barra lateral, quien está arriba tiene que ser el visor: si contesta la " +
    "barra, vuelve a taparle el nombre del archivo y el borde del documento",
);
assert.equal(arriba.padre, "BODY", "el visor va en un portal a document.body");
assert.equal(
  arriba.dentroDelContenido,
  false,
  "el visor NO puede quedar dentro del contenedor transformado: ahí `fixed` deja de referirse a la ventana",
);
assert.equal(arriba.cajaDelVisor.x, 0, "el visor arranca en el borde izquierdo de la ventana");
assert.equal(arriba.cajaDelVisor.width, arriba.ventana.ancho, "y ocupa todo el ancho");
assert.equal(arriba.cajaDelVisor.height, arriba.ventana.alto, "y todo el alto");

// Y lo mismo con la ventana angosta, que es donde la barra pesa MÁS: abajo de lg la
// barra es un cajón que se abre encima de todo con z-50 (ver BARRA_FIJA), así que un
// visor con z-index menor a eso queda tapado justo cuando la pantalla es chica y no
// sobra lugar. Sin esta comprobación, un z-40 pasaría la prueba de arriba —a 1280 px la
// barra baja a z-30— y se rompería solo en el teléfono.
assert.ok(BARRA_FIJA.includes("z-50"), "la barra sigue siendo z-50 en angosto: si cambia, revisar el z del visor");
await pagina.setViewportSize({ width: 800, height: 900 });
const enAngosto = await pagina.evaluate(() => {
  const barra = document.getElementById("barra")!.getBoundingClientRect();
  const encima = document.elementFromPoint(barra.width / 2, window.innerHeight / 2)!;
  const dialogo = document.querySelector('[role="dialog"]')!;
  return { esDelVisor: dialogo.contains(encima) || dialogo === encima, zBarra: getComputedStyle(document.getElementById("barra")!).zIndex };
});
assert.equal(enAngosto.zBarra, "50", `la barra tiene que ser z-50 en angosto, es ${enAngosto.zBarra}`);
assert.equal(
  enAngosto.esDelVisor,
  true,
  "con la ventana angosta la barra sube a z-50: el visor tiene que quedar igual por encima",
);
await pagina.setViewportSize({ width: 1280, height: 900 });

// El nombre completo se lee: era lo que quedaba cortado.
const titulo = await pagina.locator('[role="dialog"] p[title]').first();
assert.equal(
  await titulo.textContent(),
  "e2e5f8ad-9b42-498e-8a01-ba3fc572b482.pdf",
  "el nombre del archivo va completo, no cortado por la barra",
);

// ── 2. pdf.js dibuja el documento, con la barra del core ─────────────────
await pagina.waitForSelector("canvas", { timeout: 20000 });
assert.ok(await pagina.isVisible("text=1 de 1"), 'la barra propia dice "1 de 1", en español');
assert.equal(
  await pagina.locator("iframe").count(),
  0,
  "ya no hay <iframe>: el visor del navegador traía su propia barra en inglés",
);

const anchoInicial = await pagina.evaluate(() => document.querySelector("canvas")!.getBoundingClientRect().width);
assert.ok(anchoInicial > 400, `el PDF se dibujó de ${Math.round(anchoInicial)}px de ancho`);

// Y el canvas tiene PÍXELES dibujados, no solo existe: se muestrea la imagen y se exige
// que haya algo que no sea el blanco de la hoja. Sin esto, un visor que carga el
// documento pero no lo pinta —el worker de otra versión, por ejemplo— pasaría la prueba
// con el canvas en blanco.
const esperarPixeles = () =>
  pagina.waitForFunction(
    () => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
      if (!canvas || canvas.width === 0) return false;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      const { data } = ctx.getImageData(0, 0, canvas.width, Math.min(canvas.height, 400));
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 200 && data[i + 3] > 0) return true;
      }
      return false;
    },
    null,
    { timeout: 20000 },
  );
await esperarPixeles();

// El texto del PDF llega a la capa de texto: es lo que permite copiar un RUT del
// comprobante en vez de tipearlo mirando.
await pagina.waitForFunction(
  () => (document.querySelector(".textLayer")?.textContent ?? "").includes("BOLETA"),
  null,
  { timeout: 20000 },
);

// ── 3. Descargar y abrir aparte ──────────────────────────────────────────
//
// El enlace de descarga NO puede ser la URL pelada: es de otro origen (el bucket de
// Supabase), así que el navegador ignora el atributo `download` y el archivo se abriría
// en una pestaña con el nombre del bucket. El parámetro `download` de Supabase es lo que
// lo convierte en una descarga con nombre.
const descargar = pagina.locator('a:has-text("Descargar")');
const hrefDescarga = await descargar.getAttribute("href");
assert.ok(
  hrefDescarga?.includes("download=e2e5f8ad-9b42-498e-8a01-ba3fc572b482.pdf"),
  `el enlace de descarga tiene que pedirle a Supabase el archivo con su nombre (era: ${hrefDescarga})`,
);
assert.equal(
  await descargar.getAttribute("download"),
  "e2e5f8ad-9b42-498e-8a01-ba3fc572b482.pdf",
  "y también el atributo download, por si el archivo alguna vez se sirve del mismo origen",
);
const aparte = pagina.locator('a:has-text("Abrir aparte")');
assert.equal(await aparte.getAttribute("href"), "/comprobante.pdf", "«abrir aparte» abre el archivo tal cual");
assert.equal(await aparte.getAttribute("target"), "_blank");

// ── 4. Los botones de la barra hacen algo ────────────────────────────────
await pagina.click('[aria-label="Acercar"]');
await pagina.waitForFunction(
  (antes) => document.querySelector("canvas")!.getBoundingClientRect().width > antes + 10,
  anchoInicial,
  { timeout: 10000 },
);
assert.ok(await pagina.isVisible("text=125%"), "el zoom se ve en la barra");

await pagina.click("text=125%"); // volver al 100%
await pagina.waitForSelector("text=100%");
// Y el documento vuelve a estar dibujado después del viaje de zoom: un canvas que queda
// en blanco tras acercar y volver es justo lo que se reporta como "se ve mal".
await esperarPixeles();

assert.ok(
  await pagina.locator('[aria-label="Página siguiente"]').isDisabled(),
  "con una sola página, «siguiente» está apagado",
);
assert.ok(await pagina.locator('[aria-label="Página anterior"]').isDisabled(), "y «anterior» también");

// La captura antes de girar: es el estado en que se usa el visor.
if (process.env.CAPTURA) await pagina.screenshot({ path: process.env.CAPTURA });

// Girar no puede romper el dibujado: el canvas se da vuelta y sigue ahí. Se mide el ALTO
// y no el ancho: `width` es lo que se le pide a react-pdf, así que al girar 90° una hoja
// vertical el ancho queda igual y lo que cambia es el alto.
const antesDeGirar = await pagina.evaluate(() => {
  const c = document.querySelector("canvas")!.getBoundingClientRect();
  return { ancho: c.width, alto: c.height };
});
await pagina.click('[aria-label="Girar"]');
await pagina.waitForFunction(
  (antes) => {
    const c = document.querySelector("canvas")?.getBoundingClientRect();
    return c !== undefined && c.height < antes.alto * 0.9;
  },
  antesDeGirar,
  { timeout: 10000 },
);



// ── 5. Escape cierra ─────────────────────────────────────────────────────
await pagina.keyboard.press("Escape");
assert.equal(await pagina.evaluate(() => (window as never as { cerrado?: boolean }).cerrado), true);

assert.deepEqual(errores, [], `el visor no puede lanzar: ${errores.join(" · ")}`);
await navegador.close();
console.log(
  `El visor tapa la ventana entera (${arriba.ventana.ancho}×${arriba.ventana.alto}) por encima de la barra de ` +
    `${arriba.anchoBarra}px, el nombre se lee completo, y pdf.js dibuja el PDF a ${Math.round(anchoInicial)}px ` +
    "con la barra del core en español.",
);
