// Verifica que en cada <table> el colgroup, el thead y cada fila del tbody tengan
// el MISMO número de columnas.
//
// Un desajuste no rompe el build ni el tipado: la tabla se renderiza igual, con el
// encabezado corrido respecto de los datos. Pasó de verdad en el Cotizador — el
// colgroup y el thead quedaron con diez columnas y el cuerpo con ocho, así que
// "Cliente" aparecía sobre la faena y el monto bajo "Tipo". Se ve mal pero se lee
// como si estuviera bien, que es lo peligroso.
//
//   node scripts/verificar-tablas.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return ruta.endsWith(".tsx") ? [ruta] : [];
  });
}

// Cuenta etiquetas de primer nivel, ignorando las que estén dentro de otra tabla
// anidada (no hay hoy, pero contarlas silenciosamente sería peor que fallar).
const contar = (texto, etiqueta) => (texto.match(new RegExp(`<${etiqueta}\\b`, "g")) ?? []).length;

const problemas = [];

for (const ruta of [...archivos("components"), ...archivos("app")]) {
  const src = readFileSync(ruta, "utf8");
  let desde = 0;

  while (true) {
    const ini = src.indexOf("<table", desde);
    if (ini === -1) break;
    const fin = src.indexOf("</table>", ini);
    if (fin === -1) break;
    const tabla = src.slice(ini, fin);
    desde = fin + 1;

    // Sin colgroup no hay anchos declarados que puedan desalinearse.
    if (!tabla.includes("<colgroup")) continue;

    const cols = contar(tabla.slice(tabla.indexOf("<colgroup"), tabla.indexOf("</colgroup>")), "col");
    const ths = contar(tabla, "th");
    const linea = src.slice(0, ini).split("\n").length;

    if (cols !== ths) {
      problemas.push(`${ruta}:${linea} — ${cols} <col> pero ${ths} <th>`);
      continue;
    }

    // Los <td> se cuentan sobre TODO el tbody: con varias filas el total tiene que
    // ser múltiplo del número de columnas. No detecta dos filas mal compensadas
    // entre sí, pero sí el caso real: el cuerpo entero con otro número de celdas.
    const iTbody = tabla.indexOf("<tbody");
    if (iTbody === -1) continue;
    const tds = contar(tabla.slice(iTbody), "td");
    if (tds % cols !== 0) {
      problemas.push(`${ruta}:${linea} — ${cols} columnas pero ${tds} <td> en el tbody (no es múltiplo)`);
    }
  }
}

if (problemas.length > 0) {
  console.error(`${problemas.length} tabla(s) con el encabezado desalineado:\n`);
  problemas.forEach((p) => console.error(`  ${p}`));
  process.exit(1);
}
console.log("Todas las tablas con colgroup tienen sus columnas alineadas.");
