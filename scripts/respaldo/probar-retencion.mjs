// Prueba de la retención de respaldos (la parte que BORRA archivos). No usa red ni credenciales.
//   node scripts/respaldo/probar-retencion.mjs
import assert from "node:assert/strict";
import { elegirParaBorrar } from "./sharepoint.mjs";

const AHORA = Date.UTC(2026, 10, 30); // 30-nov-2026
const dia = (n) => new Date(AHORA - n * 86_400_000).toISOString().slice(0, 10); // hace n días
let id = 0;
const archivo = (nombre) => ({ id: `id-${++id}`, name: nombre, file: {} });
const respaldo = (proyecto, hace) => [archivo(`${proyecto}_${dia(hace)}.tar.gz.age`), archivo(`${proyecto}_${dia(hace)}.tar.gz.age.sha256`)];
const ids = (lista) => new Set(lista.map((e) => e.id));

let n = 0;
function caso(titulo, fn) {
  fn();
  n++;
  console.log(`OK   ${titulo}`);
}

caso("40 días seguidos: borra solo lo de más de 30 días y deja el par .age/.sha256 junto", () => {
  const elementos = Array.from({ length: 40 }, (_, i) => respaldo("core-pertec", i)).flat();
  const borrar = elegirParaBorrar(elementos, AHORA, 30);
  const fechas = new Set(borrar.map((e) => e.name.match(/\d{4}-\d{2}-\d{2}/)[0]));
  assert.equal(borrar.length, 18, "días 31..39 = 9 días x 2 archivos");
  assert.ok([...fechas].every((f) => f < dia(30)), "ninguno de 30 días o menos");
  for (const f of fechas) assert.equal(borrar.filter((e) => e.name.includes(f)).length, 2, "el .age y el .sha256 de un día se borran juntos");
});

caso("si los respaldos dejaron de generarse, NUNCA vacía la carpeta: conserva los 7 más nuevos", () => {
  // Diez respaldos, todos de hace 60 a 69 días.
  const elementos = Array.from({ length: 10 }, (_, i) => respaldo("core-pertec", 60 + i)).flat();
  const borrar = elegirParaBorrar(elementos, AHORA, 30);
  assert.equal(borrar.length, 6, "3 días x 2 archivos: quedan los 7 días más nuevos");
  const borrados = ids(borrar);
  const quedan = elementos.filter((e) => !borrados.has(e.id)).map((e) => e.name);
  assert.equal(quedan.length, 14);
  assert.ok(quedan.some((x) => x.includes(dia(60))), "el más nuevo se conserva");
  assert.ok(!quedan.some((x) => x.includes(dia(69))), "el más viejo se borró");
});

caso("con 7 respaldos o menos no borra nada, por viejos que sean", () => {
  const elementos = Array.from({ length: 7 }, (_, i) => respaldo("pertec-web", 100 + i)).flat();
  assert.equal(elegirParaBorrar(elementos, AHORA, 30).length, 0);
});

caso("cada proyecto cuenta aparte: uno viejo no protege ni condena al otro", () => {
  const core = Array.from({ length: 12 }, (_, i) => respaldo("core-pertec", i)).flat(); // todos recientes
  const web = Array.from({ length: 10 }, (_, i) => respaldo("pertec-web", 50 + i)).flat(); // todos viejos
  const borrar = elegirParaBorrar([...core, ...web], AHORA, 30);
  assert.ok(borrar.every((e) => e.proyecto === "pertec-web"), "solo toca pertec-web");
  assert.equal(borrar.length, 6, "pertec-web: 10 días, conserva 7, borra 3 x 2");
});

caso("no toca archivos ajenos ni con nombre parecido (la carpeta puede tener otras cosas)", () => {
  const ajenos = [
    archivo("informe-2020.xlsx"),
    archivo("core-pertec_2020-01-01.tar.gz"), // sin cifrar: no es de este flujo
    archivo("core-pertec_2020-01-01.tar.gz.age.bak"),
    archivo("otro-proyecto_2020-01-01.tar.gz.age"),
    archivo("core-pertec_ayer.tar.gz.age"),
    { id: "carpeta", name: "core-pertec_2020-01-01.tar.gz.age", folder: {} }, // es una carpeta, no un archivo
  ];
  const viejos = Array.from({ length: 10 }, (_, i) => respaldo("core-pertec", 90 + i)).flat();
  const borrar = elegirParaBorrar([...ajenos, ...viejos], AHORA, 30);
  const idsAjenos = ids(ajenos);
  assert.ok(!borrar.some((e) => idsAjenos.has(e.id)), "ningún archivo ajeno ni carpeta se borra");
  assert.ok(borrar.every((e) => /^core-pertec_\d{4}-\d{2}-\d{2}\.tar\.gz\.age(\.sha256)?$/.test(e.name)), "solo nombres exactos del workflow");
  assert.equal(borrar.length, 6);
});

caso("carpeta vacía o sin respaldos: no hace nada ni falla", () => {
  assert.deepEqual(elegirParaBorrar([], AHORA, 30), []);
  assert.deepEqual(elegirParaBorrar([archivo("nota.txt")], AHORA, 30), []);
});

caso("el límite es exacto: un respaldo de exactamente 30 días NO se borra, uno de 31 sí", () => {
  const elementos = [...Array.from({ length: 8 }, (_, i) => respaldo("core-pertec", i)).flat(), ...respaldo("core-pertec", 30), ...respaldo("core-pertec", 31)];
  const borrar = elegirParaBorrar(elementos, AHORA, 30);
  const fechas = [...new Set(borrar.map((e) => e.name.match(/\d{4}-\d{2}-\d{2}/)[0]))];
  assert.deepEqual(fechas, [dia(31)]);
});

console.log(`\n${n} casos de retención correctos`);
