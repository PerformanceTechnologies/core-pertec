// Prueba el tablero de Tareas (CRM): el orden al mover, las vencidas y los candados.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COLUMNAS, describirCambios, esEstado, esPrioridad, estaVencida, ordenEntre } from "../lib/tareas-modelo";

assert.equal(ordenEntre(null, null), 1000);
assert.equal(ordenEntre(1000, null), 2000);
assert.equal(ordenEntre(null, 1000), 0);
assert.equal(ordenEntre(1000, 2000), 1500);

const hoy = new Date(2026, 10, 2);
assert.equal(estaVencida({ fechaLimite: "2026-11-01", estado: "por_hacer" }, hoy), true);
assert.equal(estaVencida({ fechaLimite: "2026-11-02", estado: "en_curso" }, hoy), false);
assert.equal(estaVencida({ fechaLimite: "2026-11-01", estado: "hecho" }, hoy), false);
assert.equal(estaVencida({ fechaLimite: null, estado: "por_hacer" }, hoy), false);

assert.ok(esEstado("en_curso") && !esEstado("archivado"));
assert.ok(esPrioridad("alta") && !esPrioridad("urgente"));

// La migración acepta exactamente los mismos estados y prioridades que el código.
const sql = readFileSync("supabase/tareas/0001_tareas.sql", "utf8");
assert.ok(sql.includes(`check (estado in (${COLUMNAS.map((c) => `'${c.estado}'`).join(", ")}))`));
assert.ok(sql.includes("check (prioridad in ('baja', 'media', 'alta'))"));
assert.ok(sql.includes("enable row level security"));

// Varios responsables y quién asignó: la migración copia el responsable de antes a la lista.
const sql2 = readFileSync("supabase/tareas/0002_varios_responsables.sql", "utf8");
assert.ok(sql2.includes("responsables text[]") && sql2.includes("asignado_por text"));
assert.ok(sql2.includes("set responsables = array[responsable]"));

// Historial: qué cambió, en palabras.
{
  const base = { titulo: "A", descripcion: null, prioridad: "media", responsables: ["a@x.cl"], asignadoPor: null, fechaLimite: null };
  const nombre = (c: string) => ({ "a@x.cl": "Ana", "b@x.cl": "Beto" })[c] ?? c;
  assert.deepEqual(describirCambios(base, base, nombre), []);
  assert.deepEqual(
    describirCambios(base, { ...base, prioridad: "alta", responsables: ["A@x.cl", "b@x.cl"], asignadoPor: "a@x.cl" }, nombre),
    ["prioridad de Media a Alta", "agregó a Beto como responsable", "«asignado por» a Ana"],
  );
  assert.deepEqual(describirCambios(base, { ...base, responsables: [] }, nombre), ["quitó a Ana de responsable"]);
  const sql3 = readFileSync("supabase/tareas/0003_historial.sql", "utf8");
  assert.ok(sql3.includes("on delete cascade") && sql3.includes("enable row level security"));
}

// Toda Server Action exige la app antes de escribir.
const acciones = readFileSync("app/(protegido)/tareas/acciones.ts", "utf8");
const exportadas = acciones.match(/export async function \w+/g) ?? [];
assert.equal(exportadas.length, 5);
assert.equal((acciones.match(/await exigirAccesoApp\(SLUG_APP_TAREAS\)/g) ?? []).length, 5);

console.log("Tareas verificado: orden al mover, vencidas, migración alineada y 5 acciones con permiso, historial.");
