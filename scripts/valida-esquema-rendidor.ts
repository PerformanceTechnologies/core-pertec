// Extrae el ESQUEMA del módulo y lo revisa contra las restricciones que la API
// documenta para structured outputs, sin necesidad de llamar a la API.
import { readFileSync } from "fs";
import { TIPOS_DOCUMENTO, CATEGORIAS_GASTO } from "../lib/rendidor/tipos";

const src = readFileSync("lib/rendidor/analizar.ts", "utf8");
const ini = src.indexOf("const ESQUEMA = {");
const fin = src.indexOf("} as const;", ini);
if (ini === -1 || fin === -1) throw new Error("no encontré el ESQUEMA");

// Resuelve los spreads de las tablas canónicas para poder evaluar el literal
const cuerpo = src
  .slice(ini + "const ESQUEMA = ".length, fin + 1)
  .replace(/\.\.\.TIPOS_DOCUMENTO/g, JSON.stringify(TIPOS_DOCUMENTO).slice(1, -1))
  .replace(/\.\.\.CATEGORIAS_GASTO/g, JSON.stringify(CATEGORIAS_GASTO).slice(1, -1));

const esquema = eval(`(${cuerpo})`) as Record<string, any>;

let fallos = 0;
const ok = (c: boolean, l: string) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) fallos++; };

// 1) El bug que rompió en producción: enum junto a un type de union
const conEnumYUnion: string[] = [];
const recorrer = (nodo: any, ruta: string) => {
  if (!nodo || typeof nodo !== "object") return;
  if (nodo.enum && Array.isArray(nodo.type)) conEnumYUnion.push(ruta);
  if (nodo.properties) for (const [k, v] of Object.entries(nodo.properties)) recorrer(v, `${ruta}.${k}`);
  if (nodo.anyOf) nodo.anyOf.forEach((v: any, i: number) => recorrer(v, `${ruta}.anyOf[${i}]`));
  if (nodo.items) recorrer(nodo.items, `${ruta}[]`);
};
recorrer(esquema, "root");
ok(conEnumYUnion.length === 0, `ningún enum con type de union${conEnumYUnion.length ? " -> " + conEnumYUnion.join(", ") : ""}`);

// 2) Un enum nullable tiene que quedar expresado como anyOf
for (const campo of ["tipoDocumento", "categoria"]) {
  const p = esquema.properties[campo];
  ok(Array.isArray(p.anyOf), `${campo}: usa anyOf`);
  ok(p.anyOf?.some((v: any) => v.type === "null"), `${campo}: admite null`);
  const e = p.anyOf?.find((v: any) => v.enum)?.enum ?? [];
  ok(e.length > 0 && !e.includes(null), `${campo}: enum sin null adentro (${e.length} valores)`);
}

// 3) tipoDocumento debe listar EXACTAMENTE los valores del selection de Odoo
const enumTipo = esquema.properties.tipoDocumento.anyOf.find((v: any) => v.enum).enum;
ok(JSON.stringify(enumTipo) === JSON.stringify([...TIPOS_DOCUMENTO]), `tipoDocumento calza con TIPOS_DOCUMENTO (${TIPOS_DOCUMENTO.length})`);
const enumCat = esquema.properties.categoria.anyOf.find((v: any) => v.enum).enum;
ok(JSON.stringify(enumCat) === JSON.stringify([...CATEGORIAS_GASTO]), `categoria calza con CATEGORIAS_GASTO (${CATEGORIAS_GASTO.length})`);

// 4) Restricciones estructurales que la API exige
ok(esquema.additionalProperties === false, "additionalProperties: false");
const props = Object.keys(esquema.properties);
const faltan = props.filter((p) => !esquema.required.includes(p));
ok(faltan.length === 0, `todas las propiedades en required${faltan.length ? " -> faltan " + faltan.join(", ") : ""}`);
const sobran = esquema.required.filter((r: string) => !props.includes(r));
ok(sobran.length === 0, `required sin campos fantasma${sobran.length ? " -> " + sobran.join(", ") : ""}`);

// 5) Restricciones NO soportadas por structured outputs
const noSoportadas = ["minimum", "maximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems", "pattern"];
const usadas: string[] = [];
const buscar = (nodo: any, ruta: string) => {
  if (!nodo || typeof nodo !== "object") return;
  for (const k of noSoportadas) if (k in nodo) usadas.push(`${ruta}.${k}`);
  if (nodo.properties) for (const [k, v] of Object.entries(nodo.properties)) buscar(v, `${ruta}.${k}`);
  if (nodo.anyOf) nodo.anyOf.forEach((v: any, i: number) => buscar(v, `${ruta}.anyOf[${i}]`));
  if (nodo.items) buscar(nodo.items, `${ruta}[]`);
};
buscar(esquema, "root");
ok(usadas.length === 0, `sin restricciones no soportadas${usadas.length ? " -> " + usadas.join(", ") : ""}`);

console.log(fallos === 0 ? "\n✅ ESQUEMA VÁLIDO" : `\n❌ ${fallos} PROBLEMAS`);
process.exit(fallos === 0 ? 0 : 1);
