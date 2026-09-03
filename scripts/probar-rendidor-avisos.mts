/**
 * Los avisos de una rendición y la ventana de carga, en un navegador de verdad.
 *
 * Correr con:  npm run probar-avisos
 *
 * El reclamo era de uso, no de lógica: "está muy poco intuitivo". Los avisos eran dos
 * tiras de doce píxeles debajo del título —se veían solo arriba, se pisaban entre sí y se
 * iban con el siguiente evento—, y el paso de confirmar y cargar a Odoo era un cuarto
 * bloque colgado al final, a tres pantallas de tarjetas de gasto.
 *
 * Eso no se prueba leyendo el archivo: hay que apretar el botón y mirar qué pasa. Se
 * monta el componente REAL, compilado con esbuild y con React, en un Chromium, y se
 * comprueba lo que ve la persona: que el aviso aparezca abajo a la derecha, que se cierre
 * con su ×, que dos avisos se apilen en vez de reemplazarse, que la ventana de carga tape
 * la página y se pueda volver atrás sin perder lo elegido, y que el gasto sin proveedor
 * quede marcado EN SU LUGAR.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { chromium } from "playwright";

const carpeta = mkdtempSync(join(tmpdir(), "rendidor-avisos-"));

// El CSS del proyecto compilado por su propio Tailwind: las clases que posicionan los
// avisos —fixed, bottom-4, right-4— tienen que existir de verdad, y la de `destacado`
// vive en globals.css.
execFileSync("npx", ["@tailwindcss/cli", "-i", "app/globals.css", "-o", join(carpeta, "estilos.css")], {
  stdio: "pipe",
});

// El componente REAL. Se le da un punto de entrada que lo monta con dos gastos y sin
// proveedores resueltos, que es el estado del que se quejaba la persona.
writeFileSync(
  join(carpeta, "entrada.tsx"),
  `
import { createRoot } from "react-dom/client";
import PanelRendicion from "${process.cwd()}/components/rendidor/PanelRendicion";

const gasto = (id: string, orden: number, proveedor: string) => ({
  id, orden, proveedor, rutProveedor: "76.929.210-1", fecha: "2026-08-12",
  tipoDocumento: "factura_afecta", categoria: "Alojamiento", total: 25000,
  neto: 21008, iva: 3992, exento: 0, glosa: "Hotel", archivoNombre: "c" + orden + ".pdf",
  archivoTipo: "application/pdf", archivoPath: null, pendientes: [], odooExpenseId: null,
  odooPartnerId: null,
});

createRoot(document.getElementById("raiz")!).render(
  <PanelRendicion
    rendicionInicial={{
      id: "r1", nombreQuienRinde: "Alex Oliva", montoAsignado: 0,
      tituloRendicion: "Operación Antucoya", estado: "borrador", empresaCompanyId: 1,
      odooEmployeeId: 7, creadoPor: "u1", creadoEn: "2026-08-12T12:00:00Z",
      gastos: [gasto("g1", 1, "Hotel Norte"), gasto("g2", 2, "Copec")],
    } as never}
  />,
);
`,
);

const { outputFiles } = await esbuild.build({
  entryPoints: [join(carpeta, "entrada.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  write: false,
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".tsx": "tsx", ".ts": "ts" },
  // El punto de entrada vive en una carpeta temporal fuera del proyecto, así que la
  // resolución normal de node no encuentra react ni react-dom desde ahí. Se le dice
  // dónde están: es eso o escribir archivos de prueba dentro del repo.
  absWorkingDir: process.cwd(),
  nodePaths: [join(process.cwd(), "node_modules")],
});
writeFileSync(join(carpeta, "panel.js"), outputFiles[0].text);

writeFileSync(
  join(carpeta, "index.html"),
  `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="estilos.css"></head>
<body class="bg-crema text-tinta"><div id="raiz"></div>
<script src="panel.js"></script></body></html>`,
);

const navegador = await chromium.launch({ headless: true });
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 800 } });
const errores: string[] = [];
pagina.on("pageerror", (e) => errores.push(e.message));

// Un origen http inventado, servido desde los archivos del disco. Con file:// los fetch
// relativos del componente —"/api/rendidor/proveedores"— resuelven a file:///api/... y
// mueren con "Failed to fetch" antes de que page.route pueda interceptarlos.
const ORIGEN = "http://rendidor.local";
const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};
await pagina.route(`${ORIGEN}/**`, (ruta) => {
  const nombre = new URL(ruta.request().url()).pathname.replace(/^\//, "") || "index.html";
  // Las rutas de la API las atienden los route() de más abajo, que se registran después
  // y ganan: acá solo se sirven los tres archivos de la página.
  if (nombre.startsWith("api/")) return ruta.fallback();
  const extension = nombre.slice(nombre.lastIndexOf("."));
  const tipo = TIPOS[extension];
  // Lo que no es uno de los tres archivos de la página —el CSS pide una textura de
  // fondo— se contesta vacío: no cambia nada de lo que se mide y ahorra copiar assets.
  if (!tipo) return ruta.fulfill({ status: 200, contentType: "text/plain", body: "" });
  return ruta.fulfill({ status: 200, contentType: tipo, body: readFileSync(join(carpeta, nombre)) });
});
await pagina.goto(`${ORIGEN}/index.html`);
await pagina.waitForSelector("text=Operación Antucoya");
assert.deepEqual(errores, [], `el panel no puede lanzar al montarse: ${errores.join(" · ")}`);

// El servidor no existe en esta prueba, así que "Continuar a Odoo" —que consulta los
// proveedores— falla. Se intercepta para poder llegar al estado que interesa: la ventana
// de carga con dos gastos sin proveedor resuelto.
// El autoguardado también pega contra el servidor: se responde ok para que no ensucie
// los avisos con un error de guardado que no es lo que se está probando.
await pagina.route("**/api/rendidor/**/gastos", (ruta) =>
  ruta.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
);
await pagina.route("**/api/rendidor/proveedores", (ruta) =>
  ruta.fulfill({
    status: 200,
    contentType: "application/json",
    // Los dos casos que importan: uno con VARIOS candidatos —que es el único que deja
    // algo por elegir, porque un candidato único se autoselecciona— y otro que no existe
    // en Odoo y se va a crear.
    body: JSON.stringify({
      resultados: [
        {
          gastoId: "g1",
          candidatos: [
            { id: 11, name: "HOTEL NORTE SPA", vat: "76929210-1" },
            { id: 12, name: "HOTEL NORTE LTDA", vat: "76929210-1" },
          ],
        },
        { gastoId: "g2", candidatos: [] },
      ],
    }),
  }),
);

// ── 1. El aviso aparece abajo a la derecha y se cierra con su × ────────────
await pagina.click("text=Continuar a Odoo");
// Si algo falla del lado del componente, el aviso lo dice: se mira antes de esperar el
// diálogo, así el error que sale es el de verdad y no un timeout.
await pagina.waitForTimeout(800);
const alContinuar = await pagina.evaluate(() => ({
  aviso: document.querySelector('[role="alert"], [role="status"]')?.textContent ?? null,
  dialogo: Boolean(document.querySelector('[role="dialog"]')),
}));
console.log(alContinuar);
assert.ok(alContinuar.dialogo, `no se abrió la ventana de carga. Aviso: ${alContinuar.aviso}`);

// La ventana TAPA la página: es la mitad del pedido —el paso 3 estaba colgado al final y
// había que bajar tres pantallas para encontrarlo—.
const ventana = await pagina.evaluate(() => {
  const d = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const caja = d.getBoundingClientRect();
  return {
    tapaLaPagina: caja.width >= window.innerWidth - 1 && caja.height >= window.innerHeight - 1,
    fondoBloqueado: document.body.style.overflow === "hidden",
    tieneVolver: Boolean(d.querySelector("button")?.textContent?.includes("Volver")),
  };
});
console.log(ventana);
assert.ok(ventana.tapaLaPagina, "la ventana de carga ocupa la pantalla");
assert.ok(ventana.fondoBloqueado, "y el fondo no scrollea mientras está abierta");
assert.ok(ventana.tieneVolver, "y ofrece volver a corregir");

// ── 2. El gasto sin proveedor queda marcado EN SU LUGAR ───────────────────
//
// Antes esto se sabía recién al apretar "cargar", y como un número: "hay 2 sin proveedor"
// sobre una lista de tarjetas iguales.
const marcas = await pagina.evaluate(() => {
  const bloques = [...document.querySelectorAll<HTMLElement>('[id^="proveedor-"]')];
  return bloques.map((b) => ({
    id: b.id,
    marcado: b.className.includes("border-red-600/45"),
    dice: b.textContent?.includes("falta elegir") ?? false,
    selectInvalido: b.querySelector("select")?.getAttribute("aria-invalid") === "true",
  }));
});
console.log(marcas);
assert.equal(marcas.length, 2, "hay un bloque por gasto");
const conDos = marcas.find((m) => m.id === "proveedor-g1")!;
const aCrear = marcas.find((m) => m.id === "proveedor-g2")!;
assert.ok(
  conDos.marcado && conDos.dice && conDos.selectInvalido,
  "el que tiene dos candidatos arranca MARCADO y con su select inválido, antes de apretar nada",
);
assert.ok(
  !aCrear.marcado && !aCrear.dice,
  "y el que se va a crear no se marca: ahí no falta elegir nada",
);

// El resumen de lo que falta, junto al botón y no tres pantallas arriba.
assert.ok(
  await pagina.isVisible("text=Falta esto para poder cargar"),
  "la ventana lista lo que falta antes de cargar",
);

// ── 3. Apretar cargar avisa, y el aviso lleva hasta el problema ───────────
await pagina.click("text=Confirmar y crear");
await pagina.waitForSelector('[role="alert"]');
const elAviso = await pagina.evaluate(() => {
  const a = document.querySelector<HTMLElement>('[role="alert"]')!;
  const caja = a.getBoundingClientRect();
  return {
    texto: a.textContent ?? "",
    // Abajo a la derecha: es lo que se pidió, y es lo que hace que se vea desde
    // cualquier punto de la página.
    abajo: caja.bottom > window.innerHeight * 0.6,
    derecha: caja.right > window.innerWidth * 0.6,
    tieneCerrar: Boolean(a.querySelector('[aria-label="Cerrar aviso"]')),
  };
});
console.log(elAviso);
assert.ok(
  elAviso.texto.includes("Falta elegir el proveedor de 1 gasto(s)"),
  `el aviso dice cuántos faltan (dijo: ${elAviso.texto})`,
);
assert.ok(elAviso.abajo && elAviso.derecha, "y aparece abajo a la derecha");
assert.ok(elAviso.tieneCerrar, "con su × para cerrarlo");

// No se va solo: se cierra con la ×. Un aviso que desaparece a los cinco segundos es un
// aviso que alguien no leyó.
await pagina.waitForTimeout(1200);
assert.ok(await pagina.isVisible('[role="alert"]'), "el aviso no se va solo");
await pagina.click('[aria-label="Cerrar aviso"]');
assert.equal(await pagina.locator('[role="alert"]').count(), 0, "y con la × se va");

// ── 4. Volver a corregir NO pierde lo elegido ─────────────────────────────
//
// Es la otra mitad del pedido: verificar los proveedores es justo cuando uno descubre que
// un gasto tiene mal el RUT, así que tiene que poder volver, arreglarlo y seguir.
await pagina.selectOption('[id="proveedor-g1"] select', "11");
await pagina.click("text=← Volver a corregir");
await pagina.waitForSelector('[role="dialog"]', { state: "detached" });
assert.equal(
  await pagina.evaluate(() => document.body.style.overflow),
  "",
  "al volver, el fondo vuelve a scrollear",
);
assert.ok(await pagina.isVisible("text=2 · Revisar y corregir"), "y se vuelve a la corrección");

await pagina.click("text=Continuar a Odoo");
await pagina.waitForSelector('[role="dialog"]');
const conservado = await pagina.evaluate(() => ({
  elegido: document.querySelector<HTMLSelectElement>('[id="proveedor-g1"] select')?.value,
  marcado: document
    .querySelector<HTMLElement>('[id="proveedor-g1"]')!
    .className.includes("border-red-600/45"),
}));
console.log(conservado);
assert.equal(conservado.elegido, "11", "el proveedor que ya se eligió sigue elegido");
assert.ok(!conservado.marcado, "y su bloque deja de estar marcado");

// Una captura, para mirarlo con ojos: el reclamo era de uso, no de lógica.
if (process.env.CAPTURA) {
  await pagina.click("text=Confirmar y crear");
  await pagina.waitForSelector('[role="alert"]');
  await pagina.screenshot({ path: process.env.CAPTURA, fullPage: false });
}

await navegador.close();

// ── El admin ve las rendiciones de todos ──────────────────────────────────
//
// El detalle ya dejaba entrar a un admin a cualquier rendición, pero la LISTA filtraba
// por creado_por: la única forma de revisar lo que rindió otra persona era conocer su
// URL. El filtro va en la consulta y no en el resultado: filtrarlo después significa
// traer las rendiciones de toda la empresa a la memoria del servidor para descartarlas,
// y el día que alguien lea `data` antes del filtro, se filtran.
const fuenteDatos = readFileSync(new URL("../lib/rendidor/datos.ts", import.meta.url), "utf8");
const cuerpoListar = fuenteDatos.slice(
  fuenteDatos.indexOf("export async function listarRendiciones"),
  fuenteDatos.indexOf("export async function obtenerRendicion"),
);
assert.ok(
  /quien\.rol === "admin"\s*\?\s*consulta\s*:\s*consulta\.eq\("creado_por", quien\.usuarioId\)/.test(
    cuerpoListar,
  ),
  "un admin consulta sin filtro y el resto por su usuario, y se decide EN la consulta",
);
assert.ok(
  /esMia: f\.creado_por === quien\.usuarioId/.test(cuerpoListar),
  "y cada fila dice si es propia: un admin ve las de todos y tiene que poder distinguirlas",
);
const fuenteLista = readFileSync(
  new URL("../components/rendidor/ListaRendiciones.tsx", import.meta.url),
  "utf8",
);
assert.ok(
  /!r\.esMia/.test(fuenteLista) && /de otra persona/.test(fuenteLista),
  "y la lista lo marca en pantalla: las acciones de la fila —borrar— se leen distinto",
);

console.log("Los avisos y la ventana de carga funcionan en el navegador.");
