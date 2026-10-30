/**
 * Página web administrada desde el Core: reglas y candados.
 *
 * Correr con:  npm run probar-pagina-web
 *
 * Lo que vigila:
 *  - Que lo que se escribe en las tablas del sitio sea solo lo que el sitio conoce
 *    (el admin de pertec.cl mandaba el objeto entero y aceptaba cualquier clave).
 *  - Que nunca se borre una imagen que no es del bucket.
 *  - Que cada Server Action y la ruta de subida exijan la app ANTES de tocar nada:
 *    lib/pagina-web.ts escribe con la llave de servicio del sitio.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CAMPOS_CONFIG,
  COLORES_CASO,
  ESTADOS_SOLICITUD,
  SLUG_APP_PAGINA_WEB,
  enlaceWhatsAppSolicitud,
  equipoDesdeFila,
  imagenesDeEquipo,
  imagenesQueSobran,
  rutaEnBucket,
  sanearCaso,
  sanearConfig,
  sanearEquipo,
  solicitudDesdeFila,
} from "../lib/pagina-web-modelo";
import { armarMenu } from "../lib/menu-modelo";
import type { Aplicacion } from "../lib/tipos";

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), "utf8");

// ── Catálogo ────────────────────────────────────────────────────────────────

{
  const r = sanearEquipo({
    nombre: "  Vulcanizadora 72  ",
    categoria: "servicio",
    tipo: "Traccionador", // tipo sembrado en el sitio que el selector no ofrece: se conserva
    orden: "3",
    descripcion_corta: "corta",
    imagenes: [{ url: "a" }, { url: "" }, { nada: 1 }],
    especificaciones: [{ k: "Potencia", v: "380 V" }, { k: "", v: "" }],
    descripciones_extra: [{ titulo: "", contenido: "" }, { titulo: "Uso", contenido: "" }],
    id: "otro-id",
    created_at: "1999-01-01",
    columna_inventada: "x",
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.datos.nombre, "Vulcanizadora 72");
    assert.equal(r.datos.categoria, "servicio");
    assert.equal(r.datos.tipo, "Traccionador");
    assert.equal(r.datos.orden, 3);
    assert.deepEqual(r.datos.imagenes, [{ url: "a" }], "las imágenes vacías se descartan");
    assert.deepEqual(r.datos.especificaciones, [{ k: "Potencia", v: "380 V" }], "igual que el sitio, una fila vacía se descarta");
    assert.deepEqual(r.datos.descripciones_extra, [{ titulo: "Uso", contenido: "" }]);
    for (const intruso of ["id", "created_at", "columna_inventada"]) {
      assert.ok(!(intruso in r.datos), `${intruso} no puede llegar a la tabla: se arma columna por columna`);
    }
    assert.equal(r.datos.disponible, true, "sin marcar nada, un equipo nace visible, como en el sitio");
  }
}
assert.equal(sanearEquipo({ nombre: "   " }).ok, false, "el nombre es obligatorio");
assert.equal(sanearEquipo({ nombre: "x", descripcion_corta: "a".repeat(121) }).ok, false, "la descripción corta tiene tope de 120");
{
  const r = sanearEquipo({ nombre: "x", categoria: "cualquiera", disponible: false });
  assert.ok(r.ok && r.datos.categoria === "producto" && r.datos.disponible === false, "categoría desconocida cae a producto");
}
assert.equal(equipoDesdeFila({ id: "1", nombre: "x", categoria: null }).categoria, "producto", "nula cuenta como producto, igual que el sitio");
assert.deepEqual(imagenesDeEquipo({ imagen_url: "p", imagenes: [{ url: "g1" }, { url: "g2" }] }), ["p", "g1", "g2"]);

// ── Casos ───────────────────────────────────────────────────────────────────

assert.equal(sanearCaso({ titulo: "x", color: "rosado" }).ok, false, "solo los colores que el sitio sabe pintar");
for (const c of COLORES_CASO) assert.ok(sanearCaso({ titulo: "x", color: c.valor }).ok);
{
  const r = sanearCaso({ titulo: "T", color: "teal", ano: "Continuo" });
  assert.ok(r.ok && r.datos.ano === "Continuo" && r.datos.visible_en_home === true, "año es texto; visible en home por omisión");
}

// ── Solicitudes ─────────────────────────────────────────────────────────────

assert.deepEqual(ESTADOS_SOLICITUD.map((e) => e.valor), ["nuevo", "en_proceso", "ganado", "perdido", "cerrado"], "los del CHECK de la tabla");
assert.equal(solicitudDesdeFila({ estado: "inventado" }).estado, "nuevo");
{
  const s = solicitudDesdeFila({ nombre: "Ana", tipo: "arriendo", telefono: "+56 9 1234 5678", servicio: "Vulcanizado" });
  const url = enlaceWhatsAppSolicitud(s)!;
  assert.ok(url.startsWith("https://wa.me/56912345678?text="), "WhatsApp con el número en solo dígitos");
  assert.ok(decodeURIComponent(url).includes("Cotización de arriendo"));
  assert.equal(enlaceWhatsAppSolicitud(solicitudDesdeFila({ nombre: "x" })), null, "sin teléfono no hay enlace");
}

// ── Contacto ────────────────────────────────────────────────────────────────

assert.deepEqual(
  CAMPOS_CONFIG.map((c) => c.clave),
  ["wa_servicios", "wa_arriendo", "wa_general", "wa_corporativo", "wa_fab", "wa_fab_message", "email_to", "email_subject", "email_body"],
  "las 9 claves que lee el sitio",
);
{
  const r = sanearConfig({ wa_fab: "+56 9 1234 5678", email_to: "a@pertec.cl; b@pertec.cl", clave_intrusa: "x" });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.datos.wa_fab, "56912345678", "el sitio arma wa.me/<dígitos>: se guarda en dígitos");
    assert.equal(r.datos.email_to, "a@pertec.cl, b@pertec.cl");
    assert.ok(!("clave_intrusa" in r.datos), "solo se guardan las claves que el sitio conoce");
    assert.equal(r.datos.wa_servicios, "", "vacío se guarda vacío: el sitio cae a su valor por omisión");
  }
}
assert.equal(sanearConfig({ wa_fab: "123" }).ok, false, "un teléfono de 3 dígitos no sirve para WhatsApp");
assert.equal(sanearConfig({ email_to: "comercial@pertec.cl, mal-escrito" }).ok, false, "un correo malo deja de recibir solicitudes sin aviso");

// ── Imágenes ────────────────────────────────────────────────────────────────

const BASE = "https://abc.supabase.co";
assert.equal(rutaEnBucket(`${BASE}/storage/v1/object/public/equipos/1700-ab12.jpg`, "equipos", BASE), "1700-ab12.jpg");
assert.equal(rutaEnBucket(`${BASE}/storage/v1/object/public/casos/1700-ab12.jpg`, "equipos", BASE), null, "otro bucket: no se borra");
assert.equal(rutaEnBucket("https://otro.cl/equipos/1.jpg", "equipos", BASE), null, "imagen externa: no se borra");
assert.equal(rutaEnBucket(`${BASE}/storage/v1/object/public/equipos/..%2Fcasos%2Fx.jpg`, "equipos", BASE), null, "nada de saltar de carpeta");
assert.equal(rutaEnBucket(`${BASE}/storage/v1/object/public/equipos/a%2Fb.jpg`, "equipos", BASE), null);
assert.deepEqual(imagenesQueSobran(["a", "b", "c", ""], ["b", "d"]), ["a", "c"], "se borra lo que estaba y ya no está");

// ═══════════════════════════════════════════════════════════════════════════
//  Los candados del lado del servidor
// ═══════════════════════════════════════════════════════════════════════════

const acciones = leer("../app/(protegido)/pagina-web/acciones.ts");
assert.ok(/^"use server";/.test(acciones));
const exportadas = [...acciones.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)];
assert.ok(exportadas.length >= 8, "se esperaban las acciones del módulo");
for (const [, nombre, cuerpo] of exportadas) {
  const guardia = cuerpo.indexOf("await exigirAccesoApp(SLUG_APP_PAGINA_WEB)");
  assert.ok(guardia !== -1, `${nombre} tiene que exigir la app: se puede invocar por HTTP sin pasar por la pantalla`);
  const primeraEscritura = cuerpo.search(/await (guardar|eliminar|actualizar|borrar)\w*\(/);
  assert.ok(primeraEscritura === -1 || guardia < primeraEscritura, `${nombre}: el permiso va ANTES de escribir`);
}
for (const [nombre, saneo] of [["guardarEquipoAction", "sanearEquipo("], ["guardarCasoAction", "sanearCaso("], ["guardarConfigAction", "sanearConfig("]]) {
  const cuerpo = exportadas.find(([, n]) => n === nombre)?.[2] ?? "";
  assert.ok(cuerpo.includes(saneo), `${nombre} vuelve a sanear en el servidor: lo que llega lo pudo mandar cualquiera`);
}

const ruta = leer("../app/api/pagina-web/imagen/route.ts");
assert.ok(
  ruta.indexOf("verificarAccesoAppApi(SLUG_APP_PAGINA_WEB)") !== -1 &&
    ruta.indexOf("verificarAccesoAppApi(SLUG_APP_PAGINA_WEB)") < ruta.indexOf("request.formData()"),
  "la subida verifica la app antes de leer el archivo",
);
assert.ok(/BUCKETS_WEB\.find/.test(ruta), "el bucket se elige de la lista, no del texto que llega");

const datos = leer("../lib/pagina-web.ts");
assert.ok(/^import "server-only";/m.test(datos), "lib/pagina-web.ts usa la llave de servicio del sitio: server-only");
assert.ok(!/^import "server-only";/m.test(leer("../lib/pagina-web-modelo.ts")), "el modelo lo usan los formularios: sin server-only");
assert.ok(
  /onConflict: "key"/.test(datos) && /\.in\("key", claves\)/.test(datos),
  "la configuración se lee y se escribe solo en las claves conocidas",
);

const layout = leer("../app/(protegido)/pagina-web/layout.tsx");
assert.ok(/await exigirAccesoApp\(SLUG_APP_PAGINA_WEB\)/.test(layout), "las páginas exigen la app");

// La app en el catálogo del Core, y en el menú.
const sql = leer("../supabase/pagina-web/0001_aplicacion.sql");
assert.ok(new RegExp(`'${SLUG_APP_PAGINA_WEB}', '/pagina-web'`).test(sql), "la migración registra la app con su slug y su ruta");
const app = (url: string, nombre: string) =>
  ({ id: url, nombre, slug: url.slice(1), url, tipo: "interna", icono: "apps", color: "naranjo", descripcion: null, estado: "activa", orden: 0 }) as Aplicacion;
const web = armarMenu([app("/pagina-web", "Página web")], []).find((g) => g.titulo === "Página web");
assert.deepEqual(web?.items.map((i) => [i.tipo, i.nombre]), [["app", "Configuración"], ["pronto", "Cotizador web"]]);

console.log(
  "Página web verificada: a las tablas del sitio llega solo lo que el sitio conoce, la configuración " +
    "acepta solo sus 9 claves, nunca se borra una imagen ajena al bucket, y cada acción exige la app " +
    "antes de escribir.",
);
