// Sube un respaldo cifrado a SharePoint y aplica la retención. Sin dependencias: solo Node 18+ (fetch).
//
//   node scripts/respaldo/sharepoint.mjs subir  <archivo> <carpeta>      sube (con sesión de carga: soporta archivos grandes)
//   node scripts/respaldo/sharepoint.mjs limpiar <carpeta> [dias]        borra respaldos más viejos que <dias> (30 por omisión)
//   agregar --simular para ver qué haría SIN llamar a la red ni escribir nada
//
// Variables (las mismas que ya usa el Core con Microsoft Graph y que ya existen como secrets de GitHub):
//   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET   permisos de APLICACIÓN
//   SHAREPOINT_FACTURAS_SITE_ID                             "<dominio>.sharepoint.com:/sites/<NombreSitio>"
//   SHAREPOINT_RESPALDOS_SITE_ID (opcional)                 otro sitio de destino, mismo formato; el app necesita permiso de escritura ahi
//
// La retención es conservadora a propósito: solo toca archivos con el nombre exacto que genera el workflow
// (core-pertec_AAAA-MM-DD.tar.gz.age y su .sha256) y NUNCA deja menos de 7 respaldos por proyecto.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const simular = args.includes("--simular");
const [orden, ...resto] = args.filter((a) => a !== "--simular");
const GRAPH = "https://graph.microsoft.com/v1.0";
const MINIMO_A_CONSERVAR = 7;
const PATRON = /^(core-pertec|pertec-web)_(\d{4}-\d{2}-\d{2})\.tar\.gz\.age(\.sha256)?$/;
const TROZO = 32 * 320 * 1024; // Graph exige múltiplos de 320 KiB: 10 MiB

function entorno(nombre) {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta la variable ${nombre}`);
  return v;
}
// Destino: SHAREPOINT_RESPALDOS_SITE_ID si existe; si no, el sitio de Finanzas, donde el app del Core ya tiene permiso de escritura.
const sitio = () => `/sites/${process.env.SHAREPOINT_RESPALDOS_SITE_ID || entorno("SHAREPOINT_FACTURAS_SITE_ID")}`;
const codificar = (ruta) => ruta.split("/").map(encodeURIComponent).join("/");

async function token() {
  const r = await fetch(`https://login.microsoftonline.com/${entorno("AZURE_TENANT_ID")}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: entorno("AZURE_CLIENT_ID"),
      client_secret: entorno("AZURE_CLIENT_SECRET"),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!r.ok) throw new Error(`No se pudo obtener el token de Graph: HTTP ${r.status}`);
  return (await r.json()).access_token;
}

async function graph(tk, ruta, opciones = {}) {
  return fetch(`${GRAPH}${ruta}`, { ...opciones, headers: { Authorization: `Bearer ${tk}`, ...(opciones.headers ?? {}) } });
}

async function subir(archivo, carpeta) {
  const nombre = path.basename(archivo);
  if (!PATRON.test(nombre)) throw new Error(`El nombre ${nombre} no es de un respaldo (core-pertec_|pertec-web_AAAA-MM-DD.tar.gz.age)`);
  const tamano = fs.statSync(archivo).size;
  const destino = `${carpeta}/${nombre}`;
  console.log(`subir ${nombre} (${(tamano / 1024 / 1024).toFixed(2)} MB) -> ${destino}`);
  if (simular) return;

  const tk = await token();
  const rs = await graph(tk, `${sitio()}/drive/root:/${codificar(destino)}:/createUploadSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
  });
  if (!rs.ok) throw new Error(`No se pudo abrir la sesión de carga: HTTP ${rs.status} ${(await rs.text()).slice(0, 200)}`);
  const { uploadUrl } = await rs.json();

  const fd = fs.openSync(archivo, "r");
  let item;
  try {
    for (let inicio = 0; inicio < tamano; inicio += TROZO) {
      const largo = Math.min(TROZO, tamano - inicio);
      const buffer = Buffer.alloc(largo);
      fs.readSync(fd, buffer, 0, largo, inicio);
      const r = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Length": String(largo), "Content-Range": `bytes ${inicio}-${inicio + largo - 1}/${tamano}` },
        body: buffer,
      });
      if (!r.ok) throw new Error(`Falló el trozo ${inicio}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      if (inicio + largo >= tamano) item = await r.json();
    }
  } finally {
    fs.closeSync(fd);
  }
  if (!item || Number(item.size) !== tamano) throw new Error(`Subida incompleta: SharePoint informa ${item?.size}, local ${tamano}`);
  console.log(`OK: ${item.name} (${item.size} bytes) verificado en SharePoint`);
}

async function listarCarpeta(tk, carpeta) {
  const elementos = [];
  let ruta = `${sitio()}/drive/root:/${codificar(carpeta)}:/children?$top=200&$select=id,name,lastModifiedDateTime,size,file`;
  while (ruta) {
    const r = await graph(tk, ruta);
    if (r.status === 404) return elementos; // la carpeta todavía no existe
    if (!r.ok) throw new Error(`No se pudo listar ${carpeta}: HTTP ${r.status}`);
    const j = await r.json();
    elementos.push(...j.value);
    ruta = j["@odata.nextLink"] ? j["@odata.nextLink"].replace(GRAPH, "") : null;
  }
  return elementos;
}

/**
 * Qué archivos de la carpeta hay que borrar por antigüedad. Función PURA (no toca la red) para poder
 * probarla: scripts/respaldo/probar-retencion.mjs.
 *
 * Reglas: solo archivos con el nombre exacto que genera el workflow; se agrupa por proyecto y por día (el
 * .age y su .sha256 van juntos); los MINIMO_A_CONSERVAR días más recientes de cada proyecto no se tocan jamás,
 * aunque sean viejos (si los respaldos dejaran de generarse, no se vacía la carpeta); y solo se borra lo que
 * tiene más de `dias` días.
 */
export function elegirParaBorrar(elementos, ahoraMs, dias) {
  const limite = ahoraMs - dias * 86_400_000;
  const porProyecto = new Map();
  for (const e of elementos) {
    if (!e.file || !PATRON.test(e.name)) continue;
    const [, proyecto, fecha] = PATRON.exec(e.name);
    if (!porProyecto.has(proyecto)) porProyecto.set(proyecto, new Map());
    const dia = porProyecto.get(proyecto);
    if (!dia.has(fecha)) dia.set(fecha, []);
    dia.get(fecha).push(e);
  }
  const borrar = [];
  for (const [proyecto, porDia] of porProyecto) {
    const fechas = [...porDia.keys()].sort().reverse(); // de más nueva a más vieja
    for (const [i, fecha] of fechas.entries()) {
      if (i < MINIMO_A_CONSERVAR) continue;
      if (new Date(`${fecha}T00:00:00Z`).getTime() >= limite) continue;
      for (const e of porDia.get(fecha)) borrar.push({ proyecto, ...e });
    }
  }
  return borrar;
}

async function limpiar(carpeta, dias) {
  console.log(`limpiar ${carpeta}: respaldos de más de ${dias} días, conservando siempre al menos ${MINIMO_A_CONSERVAR} por proyecto`);
  if (simular) return;

  const tk = await token();
  const elementos = await listarCarpeta(tk, carpeta);
  const borrar = elegirParaBorrar(elementos, Date.now(), dias);
  for (const e of borrar) {
    const r = await graph(tk, `${sitio()}/drive/items/${e.id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 404) throw new Error(`No se pudo borrar ${e.name}: HTTP ${r.status}`);
    console.log(`borrado ${e.proyecto}: ${e.name}`);
  }
  const total = elementos.filter((e) => e.file && PATRON.test(e.name)).length;
  console.log(`retención: ${borrar.length} archivo(s) borrado(s); quedan ${total - borrar.length} en ${carpeta}`);
}

// Solo corre como programa (no al importarlo desde la prueba).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (orden === "subir" && resto.length === 2) await subir(resto[0], resto[1]);
    else if (orden === "limpiar" && resto.length >= 1) await limpiar(resto[0], Number(resto[1] ?? 30));
    else {
      console.error("Uso: sharepoint.mjs subir <archivo> <carpeta> | sharepoint.mjs limpiar <carpeta> [dias]   (--simular)");
      process.exit(2);
    }
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  }
}
