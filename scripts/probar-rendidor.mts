/**
 * La pantalla de cargar a Odoo, en un navegador de verdad.
 *
 * Correr con:  npm run probar-rendidor
 *
 * El reclamo era de uso, no de lógica. Lo que se decide en este paso —el proveedor de
 * cada gasto, el fondo, y apretar el botón que escribe en Odoo— vivió primero como un
 * cuarto bloque colgado al final del formulario, después como una ventana modal encima, y
 * ahora como su propia página. Nada de eso se prueba leyendo el archivo: hay que montar
 * el componente, apretar, y mirar qué pasa.
 *
 * Se monta el componente REAL, compilado con esbuild y con React, en un Chromium.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { chromium } from "playwright";

const carpeta = mkdtempSync(join(tmpdir(), "rendidor-"));

// El CSS del proyecto compilado por su propio Tailwind: las clases que posicionan los
// avisos —fixed, bottom-4, right-4— tienen que existir de verdad.
execFileSync("npx", ["@tailwindcss/cli", "-i", "app/globals.css", "-o", join(carpeta, "estilos.css")], {
  stdio: "pipe",
});

/**
 * El router de Next, de mentira.
 *
 * `useRouter` de next/navigation lee un contexto que solo existe dentro del App Router:
 * en un montaje pelado lanza y el componente no llega a pintarse. Se reemplaza por un
 * stub que además ANOTA los push, que es lo que hace verificable "al terminar, vuelve al
 * detalle".
 */
writeFileSync(
  join(carpeta, "navegacion.ts"),
  `export const useRouter = () => ({
     push: (url: string) => { (window as any).navegadoA = url; },
     replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {},
   });
   export const useSearchParams = () => new URLSearchParams();
   export const usePathname = () => "/rendir-gastos/r1/odoo";`,
);

const gasto = (orden: number, proveedor: string) => `{
  id: "g${orden}", orden: ${orden}, proveedor: "${proveedor}", rutProveedor: "76.929.210-1",
  fecha: "2026-08-12", tipoDocumento: "factura_afecta", categoria: "Alojamiento",
  total: 25000, neto: 21008, iva: 3992, exento: 0, glosa: "Hotel",
  archivoNombre: "c${orden}.pdf", archivoTipo: "application/pdf", archivoPath: "r1/c${orden}.pdf",
  pendientes: [], odooExpenseId: null, odooPartnerId: null,
}`;

writeFileSync(
  join(carpeta, "entrada.tsx"),
  `
import { createRoot } from "react-dom/client";
import CargarAOdoo from "${process.cwd()}/components/rendidor/CargarAOdoo";

createRoot(document.getElementById("raiz")!).render(
  <CargarAOdoo
    rendicion={{
      id: "r1", nombreQuienRinde: "Alex Oliva", montoAsignado: 500000,
      tituloRendicion: "Operación Antucoya", estado: "borrador", empresaCompanyId: 1,
      odooEmployeeId: 7, creadoPor: "u1", creadoEn: "2026-08-12T12:00:00Z",
      gastos: [${gasto(1, "Hotel Norte")}, ${gasto(2, "Copec")}, ${gasto(3, "Uber")}],
    } as never}
    candidatos={[
      // Varios candidatos parecidos: el ÚNICO que pide una decisión.
      { gastoId: "g1", candidatos: [
        { id: 11, name: "HOTEL NORTE SPA", vat: "76929210-1" },
        { id: 12, name: "HOTEL NORTE LTDA", vat: "76929210-1" },
      ] },
      // Uno solo: se autoselecciona, no hay nada que preguntar.
      { gastoId: "g2", candidatos: [{ id: 21, name: "COPEC SA", vat: "99520000-7" }] },
      // Ninguno: se crea en Odoo.
      { gastoId: "g3", candidatos: [] },
    ]}
    fondos={[{ id: 14, nombre: "FR/2026/00014 — Alex Oliva — Rendición en borrador ($ 685896)" }]}
    errorFondos={null}
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
  // El punto de entrada vive fuera del proyecto, así que la resolución normal de node no
  // encuentra react desde ahí. Y next/navigation va al stub de arriba.
  absWorkingDir: process.cwd(),
  nodePaths: [join(process.cwd(), "node_modules")],
  alias: { "next/navigation": join(carpeta, "navegacion.ts") },
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
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 900 } });
const errores: string[] = [];
pagina.on("pageerror", (e) => errores.push(e.message));

// Un origen http inventado, servido del disco. Con file:// los fetch relativos del
// componente —"/api/rendidor/fondos"— resuelven a file:///api/... y mueren con "Failed to
// fetch" antes de que page.route pueda interceptarlos.
const ORIGEN = "http://rendidor.local";
const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};
await pagina.route(`${ORIGEN}/**`, (ruta) => {
  const nombre = new URL(ruta.request().url()).pathname.replace(/^\//, "") || "index.html";
  if (nombre.startsWith("api/")) return ruta.fallback();
  const tipo = TIPOS[nombre.slice(nombre.lastIndexOf("."))];
  // Lo que no es uno de los tres archivos —el CSS pide una textura de fondo— se contesta
  // vacío: no cambia nada de lo que se mide.
  if (!tipo) return ruta.fulfill({ status: 200, contentType: "text/plain", body: "" });
  return ruta.fulfill({ status: 200, contentType: tipo, body: readFileSync(join(carpeta, nombre)) });
});
await pagina.goto(`${ORIGEN}/index.html`);
await pagina.waitForSelector("text=Cargar a Odoo");
assert.deepEqual(errores, [], `el componente no puede lanzar al montarse: ${errores.join(" · ")}`);

// ── 1. Es una PÁGINA, no una ventana ──────────────────────────────────────
//
// Fue las dos cosas antes: un bloque al final del formulario y una modal encima. Las dos
// tenían el mismo problema — lo que se decide acá convivía con dieciséis tarjetas de
// gasto editables.
assert.equal(
  await pagina.locator('[role="dialog"]').count(),
  0,
  "el paso de Odoo ya no es una ventana modal",
);
assert.equal(
  await pagina.evaluate(() => document.body.style.overflow),
  "",
  "y no bloquea el scroll: es una página normal",
);

// ── 2. Solo lo necesario: se pregunta por lo que hay que DECIDIR ──────────
//
// De tres gastos, uno tiene dos proveedores parecidos en Odoo, otro se resolvió solo y el
// tercero se va a crear. Dieciséis filas que dicen "está bien" esconden las que importan.
const seccion = await pagina.evaluate(() => {
  const bloques = [...document.querySelectorAll<HTMLElement>('[id^="proveedor-"]')];
  const resumen = document.querySelector("details > summary");
  return {
    pregunta: bloques.map((b) => b.id),
    resumen: resumen?.textContent ?? null,
    // El detalle de los que no piden nada arranca PLEGADO.
    plegado: !document.querySelector("details")?.hasAttribute("open"),
  };
});
console.log(seccion);
assert.deepEqual(seccion.pregunta, ["proveedor-g1"], "se pregunta solo por el que tiene varios candidatos");
assert.ok(
  seccion.resumen?.includes("1 ya resuelto") && seccion.resumen?.includes("1 se van a crear"),
  `los otros dos se cuentan en una línea (decía: ${seccion.resumen})`,
);
assert.ok(seccion.plegado, "y ese detalle arranca plegado");

// ── 3. El botón no deja cargar sin el proveedor que falta ─────────────────
const botonCargar = pagina.locator("text=Crear 3 gasto(s) en Odoo");
assert.ok(await botonCargar.isDisabled(), "no se puede cargar con un proveedor sin elegir");
assert.ok(
  await pagina.isVisible("text=Falta elegir 1 proveedor(es)"),
  "y se dice cuántos faltan, al lado del botón",
);

await pagina.selectOption('[id="proveedor-g1"] select', "11");
assert.ok(await botonCargar.isEnabled(), "elegido el proveedor, el botón se habilita");
assert.equal(
  await pagina.locator('[id^="proveedor-"]').count(),
  0,
  "y la pregunta desaparece: ya no hay nada que decidir",
);

// ── 4. El fondo es OPCIONAL y viene sin elegir ────────────────────────────
const fondo = await pagina.evaluate(() => {
  const select = [...document.querySelectorAll<HTMLSelectElement>("select")].find(
    (s) => s.getAttribute("aria-label") === "Fondo por rendir",
  )!;
  return {
    valor: select.value,
    primera: select.options[0].textContent,
    cuantas: select.options.length,
    dice: document.body.textContent?.includes("opcional") ?? false,
  };
});
console.log(fondo);
assert.equal(fondo.valor, "", "el fondo arranca sin elegir");
assert.equal(fondo.primera, "Sin fondo", "y la primera opción es no usar ninguno");
assert.equal(fondo.cuantas, 2, "con los fondos que trajo el servidor");
assert.ok(fondo.dice, "y se dice que es opcional");

// Crear uno lo agrega a la lista Y lo deja elegido: crear un fondo y tener que buscarlo
// en el desplegable sería un paso de más sobre algo que se acaba de hacer.
await pagina.route("**/api/rendidor/fondos", (ruta) =>
  ruta.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ fondo: { id: 15, nombre: "FR/2026/00015 — Alex Oliva — Antucoya" } }),
  }),
);
await pagina.fill('input[placeholder="Operación Antucoya"]', "Antucoya septiembre");
await pagina.click("text=Crear fondo");
await pagina.waitForSelector('[role="status"]');
const trasCrear = await pagina.evaluate(() => {
  const select = [...document.querySelectorAll<HTMLSelectElement>("select")].find(
    (s) => s.getAttribute("aria-label") === "Fondo por rendir",
  )!;
  return { valor: select.value, cuantas: select.options.length };
});
console.log(trasCrear);
assert.equal(trasCrear.valor, "15", "el fondo recién creado queda elegido");
assert.equal(trasCrear.cuantas, 3, "y se agrega a la lista");

// ── 5. Al cargar, el fondo viaja con los gastos ───────────────────────────
//
// advance_id va en la CREACIÓN de cada hr.expense y no en un write posterior: el cliente
// de Odoo del core expone lectura y create, nada más.
let cuerpoCargar: Record<string, unknown> | null = null;
await pagina.route("**/api/rendidor/r1/cargar", async (ruta) => {
  cuerpoCargar = ruta.request().postDataJSON() as Record<string, unknown>;
  await ruta.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      creados: [
        { gastoId: "g1", expenseId: 101 },
        { gastoId: "g2", expenseId: 102 },
        { gastoId: "g3", expenseId: 103 },
      ],
      proveedoresCreados: [],
    }),
  });
});
// Un adjunto falla: los gastos YA están creados, así que eso no cancela nada — se avisa.
await pagina.route("**/api/rendidor/adjuntar", (ruta) =>
  ruta.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ problemas: ruta.request().postDataJSON().expenseId === 102 ? ["sin adjunto"] : [] }),
  }),
);
await pagina.route("**/api/rendidor/r1/excel", (ruta) =>
  ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ nombre: "x.xlsx" }) }),
);

await botonCargar.click();
await pagina.waitForFunction(() => (window as unknown as { navegadoA?: string }).navegadoA !== undefined);
const enviado = cuerpoCargar as unknown as {
  employeeId: number;
  advanceId: number | null;
  proveedores: { gastoId: string; partnerId?: number; crear?: { nombre: string } }[];
};
console.log(enviado);
assert.equal(enviado.advanceId, 15, "el fondo elegido viaja en la carga");
assert.equal(enviado.employeeId, 7);
assert.equal(enviado.proveedores.find((p) => p.gastoId === "g1")?.partnerId, 11, "el elegido a mano");
assert.equal(enviado.proveedores.find((p) => p.gastoId === "g2")?.partnerId, 21, "el que se autoseleccionó");
assert.ok(enviado.proveedores.find((p) => p.gastoId === "g3")?.crear, "y el que no existe se crea");

// Al terminar vuelve al detalle, con lo que quedó por revisar en la URL: así sobrevive al
// refresco y el enlace se le puede pasar a quien tenga que arreglarlo en Odoo.
const destino = await pagina.evaluate(() => (window as unknown as { navegadoA: string }).navegadoA);
console.log(destino);
assert.ok(destino.startsWith("/rendir-gastos/r1"), "vuelve al detalle de la rendición");
assert.ok(destino.includes("revisar="), "y lleva lo que quedó por revisar");
assert.ok(decodeURIComponent(destino).includes("102"), "nombrando el gasto cuyo adjunto falló");

// ── 6. Un aviso: abajo a la derecha, con su × y sin irse solo ─────────────
//
// Antes eran dos tiras de doce píxeles debajo del título: se veían solo arriba, se
// pisaban entre sí y se iban con el siguiente evento.
await pagina.goto(`${ORIGEN}/index.html`);
await pagina.waitForSelector("text=Cargar a Odoo");
await pagina.unroute("**/api/rendidor/fondos");
await pagina.route("**/api/rendidor/fondos", (ruta) =>
  ruta.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Odoo no responde" }) }),
);
await pagina.fill('input[placeholder="Operación Antucoya"]', "Antucoya");
await pagina.click("text=Crear fondo");
await pagina.waitForSelector('[role="alert"]');
const aviso = await pagina.evaluate(() => {
  const a = document.querySelector<HTMLElement>('[role="alert"]')!;
  const caja = a.getBoundingClientRect();
  return {
    texto: a.textContent ?? "",
    abajo: caja.bottom > window.innerHeight * 0.6,
    derecha: caja.right > window.innerWidth * 0.6,
    tieneCerrar: Boolean(a.querySelector('[aria-label="Cerrar aviso"]')),
  };
});
console.log(aviso);
assert.ok(aviso.texto.includes("Odoo no responde"), "el aviso trae el motivo que dio el servidor");
assert.ok(aviso.abajo && aviso.derecha, "y aparece abajo a la derecha");
assert.ok(aviso.tieneCerrar, "con su × para cerrarlo");

await pagina.waitForTimeout(1200);
assert.ok(await pagina.isVisible('[role="alert"]'), "no se va solo: lo cierra quien lo leyó");
await pagina.click('[aria-label="Cerrar aviso"]');
assert.equal(await pagina.locator('[role="alert"]').count(), 0, "y con la × se va");

if (process.env.CAPTURA) await pagina.screenshot({ path: process.env.CAPTURA, fullPage: true });
await navegador.close();

// ── El admin ve las rendiciones de todos ──────────────────────────────────
//
// El detalle ya dejaba entrar a un admin a cualquier rendición, pero la LISTA filtraba
// por creado_por: la única forma de revisar lo que rindió otra persona era conocer su
// URL. El filtro va en la consulta y no en el resultado: filtrarlo después significa
// traer las rendiciones de toda la empresa a la memoria del servidor para descartarlas.
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

// El fondo se pone al CREAR el gasto. Si esto se hiciera con un write posterior habría
// que abrir el cliente de Odoo a la escritura genérica, que está cerrado a propósito.
const fuenteOdoo = readFileSync(new URL("../lib/rendidor/odoo.ts", import.meta.url), "utf8");
assert.ok(
  /advanceId \? \{ advance_id: advanceId \} : \{\}/.test(fuenteOdoo),
  "advance_id viaja en el create del hr.expense",
);
const fuenteCliente = readFileSync(
  new URL("../lib/panel-odoo/odoo-cliente.ts", import.meta.url),
  "utf8",
);
assert.ok(
  !/"write"|"unlink"/.test(fuenteCliente),
  "el cliente de Odoo sigue sin exponer escritura genérica",
);

console.log("La pantalla de cargar a Odoo funciona en el navegador.");
