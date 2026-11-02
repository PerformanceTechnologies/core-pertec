// Prueba el tablero de Tareas (CRM): el orden al mover, las vencidas y los candados.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COLUMNAS, TIPOS_ADJUNTO, resumirMisTareas, describirCambios, esDeLaTarea, esEstado, puedeVerTarea, esPrioridad, estaVencida, ordenEntre } from "../lib/tareas-modelo";

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

// Visibilidad: privada solo para responsables y quien asignó (sin importar mayúsculas).
{
  const privada = { visibleGeneral: false, responsables: ["ana@x.cl"], asignadoPor: "beto@x.cl" };
  assert.ok(puedeVerTarea(privada, "ANA@x.cl") && puedeVerTarea(privada, "beto@x.cl"));
  assert.ok(!puedeVerTarea(privada, "carla@x.cl"));
  assert.ok(puedeVerTarea({ ...privada, visibleGeneral: true }, "carla@x.cl"));
  assert.ok(esDeLaTarea(privada, "beto@x.cl") && !esDeLaTarea(privada, "carla@x.cl"));

  // Adjuntos: nada que el navegador pueda ejecutar.
  for (const peligroso of ["text/html", "image/svg+xml", "application/javascript", "application/xhtml+xml"]) {
    assert.ok(!Object.hasOwn(TIPOS_ADJUNTO, peligroso), `${peligroso} no se acepta`);
  }

  const sql4 = readFileSync("supabase/tareas/0004_notas_y_visibilidad.sql", "utf8");
  assert.ok(sql4.includes("visible_general boolean") && sql4.includes("crm_tareas_notas"));
  assert.ok(/values \('tareas', 'tareas', false/.test(sql4), "el bucket de adjuntos es privado");
  assert.ok(sql4.includes("'nota'"));

  // Toda acción que toca una tarea pasa por tareaVisible (privadas ajenas = no existe).
  const acc = readFileSync("app/(protegido)/tareas/acciones.ts", "utf8");
  for (const f of ["actualizarTareaAction", "moverTareaAction", "eliminarTareaAction", "historialAction", "notasAction", "eliminarNotaAction", "descargarAdjuntoAction"]) {
    const cuerpo = acc.slice(acc.indexOf(`function ${f}`), acc.indexOf("\nexport", acc.indexOf(`function ${f}`) + 1));
    assert.ok(cuerpo.includes("tareaVisible("), `${f} revisa la visibilidad`);
  }
  const ruta = readFileSync("app/api/tareas/notas/route.ts", "utf8");
  assert.ok(ruta.includes("verificarAccesoAppApi(SLUG_APP_TAREAS)") && ruta.includes("puedeVerTarea(tarea, usuario.correo)"));
}

// Mi Día: solo las de la persona, no hechas, cada una en su grupo más urgente.
{
  const t = (id: string, estado: string, fecha: string | null, responsables = ["yo@x.cl"]) =>
    ({ id, titulo: id, descripcion: null, estado, prioridad: "media", responsables, asignadoPor: null, visibleGeneral: true,
       fechaLimite: fecha, orden: 0, creadoPor: null, creadoEn: "" }) as never;
  const r = resumirMisTareas([
    t("vencida", "por_hacer", "2026-11-01"),
    t("hoy", "en_curso", "2026-11-02"),
    t("pronto", "por_hacer", "2026-11-05"),
    t("lejos", "por_hacer", "2026-11-20"),
    t("curso", "en_curso", null),
    t("hecha", "hecho", "2026-11-01"),
    t("ajena", "por_hacer", "2026-11-01", ["otro@x.cl"]),
    t("mayus", "por_hacer", null, ["YO@x.cl"]),
  ], "yo@x.cl", "2026-11-02");
  const ids = (l: { id: string }[]) => l.map((x) => x.id);
  assert.deepEqual(ids(r.vencidas), ["vencida"]);
  assert.deepEqual(ids(r.hoy), ["hoy"]);
  assert.deepEqual(ids(r.proximas), ["pronto"]);
  assert.deepEqual(ids(r.enCurso), ["curso"]);
  assert.deepEqual(ids(r.porHacer), ["lejos", "mayus"]);
  assert.equal(r.total, 6);
}

// Toda Server Action exige la app antes de escribir.
const acciones = readFileSync("app/(protegido)/tareas/acciones.ts", "utf8");
const exportadas = acciones.match(/export async function \w+/g) ?? [];
assert.equal(exportadas.length, 8);
assert.equal((acciones.match(/await exigirAccesoApp\(SLUG_APP_TAREAS\)/g) ?? []).length, 8);

console.log("Tareas verificado: orden al mover, vencidas, migración alineada y 8 acciones con permiso, historial, notas y visibilidad.");
