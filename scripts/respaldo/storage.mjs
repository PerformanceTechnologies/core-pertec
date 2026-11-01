// Exporta TODOS los archivos de Storage de un proyecto de Supabase a una carpeta local.
//
// Solo lectura: lista buckets y objetos y los descarga con la llave de servicio. No necesita Docker ni el CLI
// de Supabase, solo Node 18+ (fetch).
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/respaldo/storage.mjs <carpeta-de-salida>
//
// Para probarlo en local con otras variables: --url-env NOMBRE --key-env NOMBRE (nombres de variables de entorno,
// nunca los valores).
//
// Sale con código 1 si algún archivo falla o si lo descargado no coincide con el tamaño que informa Storage:
// un respaldo incompleto tiene que fallar a gritos, no pasar por bueno.

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : porDefecto;
};
const salida = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const url = (process.env[opcion("--url-env", "SUPABASE_URL")] ?? "").replace(/\/$/, "");
const llave = process.env[opcion("--key-env", "SUPABASE_SERVICE_ROLE_KEY")] ?? "";

if (!salida || !url || !llave) {
  console.error("Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/respaldo/storage.mjs <carpeta-de-salida>");
  process.exit(2);
}

const cabeceras = { Authorization: `Bearer ${llave}`, apikey: llave };

async function api(ruta, opciones = {}) {
  let ultimo;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(url + ruta, {
        ...opciones,
        headers: { ...cabeceras, ...(opciones.headers ?? {}) },
        signal: AbortSignal.timeout(120_000),
      });
      if (r.ok || r.status < 500) return r;
      ultimo = new Error(`HTTP ${r.status} en ${ruta}`);
    } catch (e) {
      ultimo = e;
    }
    await new Promise((listo) => setTimeout(listo, 1500 * intento));
  }
  throw ultimo;
}

const codificar = (ruta) => ruta.split("/").map(encodeURIComponent).join("/");

async function listar(bucket, prefijo) {
  const objetos = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await api(`/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: prefijo, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!r.ok) throw new Error(`No se pudo listar ${bucket}/${prefijo}: HTTP ${r.status}`);
    const elementos = await r.json();
    for (const e of elementos) {
      const ruta = prefijo ? `${prefijo}/${e.name}` : e.name;
      if (e.id === null) objetos.push(...(await listar(bucket, ruta))); // carpeta
      else if (!e.name.endsWith(".emptyFolderPlaceholder")) objetos.push({ ruta, tamano: Number(e.metadata?.size ?? -1) });
    }
    if (elementos.length < 1000) break;
  }
  return objetos;
}

const rb = await api("/storage/v1/bucket");
if (!rb.ok) {
  console.error(`No se pudo listar los buckets: HTTP ${rb.status}`);
  process.exit(1);
}
const buckets = (await rb.json()).map((b) => b.id);
const indice = {};
let errores = 0;

for (const bucket of buckets) {
  const objetos = await listar(bucket, "");
  let bytes = 0;
  let descargados = 0;
  for (const o of objetos) {
    const destino = path.join(salida, "storage", bucket, ...o.ruta.split("/"));
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    try {
      const r = await api(`/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${codificar(o.ruta)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const datos = Buffer.from(await r.arrayBuffer());
      if (o.tamano >= 0 && datos.length !== o.tamano) throw new Error(`tamaño ${datos.length} distinto del informado ${o.tamano}`);
      fs.writeFileSync(destino, datos);
      bytes += datos.length;
      descargados++;
    } catch (e) {
      errores++;
      console.error(`FALLÓ ${bucket}/${o.ruta}: ${e.message}`);
    }
  }
  indice[bucket] = { archivos_en_storage: objetos.length, archivos_descargados: descargados, bytes };
  console.log(`bucket ${bucket}: ${descargados}/${objetos.length} archivos, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
}

fs.mkdirSync(path.join(salida, "storage"), { recursive: true });
fs.writeFileSync(path.join(salida, "storage", "_indice.json"), JSON.stringify(indice, null, 2));
if (errores > 0) {
  console.error(`${errores} archivo(s) con error: el respaldo de Storage está INCOMPLETO`);
  process.exit(1);
}
console.log(`Storage exportado: ${buckets.length} buckets`);
