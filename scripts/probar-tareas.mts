// Prueba el tablero de Tareas (CRM): el orden al mover, las vencidas y los candados.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COLUMNAS, TIPOS_ADJUNTO, enSuPeriodo, etiquetaFechas, resumirMisTareas, resumirTareasPedidas, revisarFechas, describirCambios, esDeLaTarea, esEstado, puedeVerTarea, esPrioridad, estaVencida, ordenEntre } from "../lib/tareas-modelo";

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

// Rango de fechas: cómo se lee, que no quede al revés y si hoy cae dentro.
{
  const f = (fechaInicio: string | null, fechaLimite: string | null) => ({ fechaInicio, fechaLimite });
  assert.equal(etiquetaFechas(f(null, null), "2026-11-02"), null);
  assert.equal(etiquetaFechas(f(null, "2026-11-07"), "2026-11-02"), "7 nov");
  assert.equal(etiquetaFechas(f("2026-11-03", "2026-11-07"), "2026-11-02"), "3 – 7 nov");
  assert.equal(etiquetaFechas(f("2026-10-28", "2026-11-03"), "2026-11-02"), "28 oct – 3 nov");
  assert.equal(etiquetaFechas(f("2026-12-28", "2027-01-05"), "2026-11-02"), "28 dic 2026 – 5 ene 2027", "un rango que cruza de año muestra los dos");
  assert.equal(etiquetaFechas(f(null, "2027-02-01"), "2026-11-02"), "1 feb 2027", "otro año lleva el año");
  assert.equal(etiquetaFechas(f("2026-11-03", null), "2026-11-02"), "desde 3 nov");
  assert.equal(etiquetaFechas(f("2026-11-07", "2026-11-07"), "2026-11-02"), "7 nov", "inicio igual al fin es un solo día");
  assert.equal(revisarFechas("2026-11-08", "2026-11-07"), "La fecha de inicio no puede ser después de la fecha límite.");
  assert.equal(revisarFechas("2026-11-03", "2026-11-07"), null);
  assert.equal(revisarFechas(null, "2026-11-07"), null);
  assert.ok(enSuPeriodo(f("2026-11-01", "2026-11-20"), "2026-11-02"));
  assert.ok(!enSuPeriodo(f("2026-11-05", "2026-11-20"), "2026-11-02"), "todavía no empieza");
  assert.ok(!enSuPeriodo(f(null, "2026-11-20"), "2026-11-02"), "sin inicio no es un período");

  const sql5 = readFileSync("supabase/tareas/0005_rango_de_fechas.sql", "utf8");
  assert.ok(sql5.includes("add column if not exists fecha_inicio date") && sql5.includes("fecha_inicio <= fecha_limite"));
  assert.ok(readFileSync("app/(protegido)/tareas/acciones.ts", "utf8").includes("revisarFechas("), "la acción rechaza un rango al revés");
}

// Mi Día: una tarea con rango que ya empezó y vence más adelante va en «En su período».
{
  const t = (id: string, inicio: string | null, fin: string | null) =>
    ({ id, titulo: id, descripcion: null, estado: "por_hacer", prioridad: "media", responsables: ["yo@x.cl"], asignadoPor: null, visibleGeneral: true,
       fechaInicio: inicio, fechaLimite: fin, orden: 0, creadoPor: null, creadoEn: "", actualizadoEn: "" }) as never;
  const r = resumirMisTareas([t("periodo", "2026-10-30", "2026-11-20"), t("futura", "2026-11-10", "2026-11-20"), t("vence", "2026-10-30", "2026-11-03")], "yo@x.cl", "2026-11-02");
  assert.deepEqual(r.enPeriodo.map((x: { id: string }) => x.id), ["periodo"]);
  assert.deepEqual(r.porHacer.map((x: { id: string }) => x.id), ["futura"]);
  assert.deepEqual(r.proximas.map((x: { id: string }) => x.id), ["vence"], "lo que vence pronto gana sobre el período");
}

// Mi Día de quien pide: lo que asignó a otros, atrasado, en marcha y terminado esta semana.
{
  const t = (id: string, estado: string, fin: string | null, responsables: string[], asignadoPor: string | null, actualizadoEn = "2026-11-01T10:00:00Z") =>
    ({ id, titulo: id, descripcion: null, estado, prioridad: "media", responsables, asignadoPor, visibleGeneral: false,
       fechaInicio: null, fechaLimite: fin, orden: 0, creadoPor: null, creadoEn: "", actualizadoEn }) as never;
  const r = resumirTareasPedidas([
    t("atrasada", "en_curso", "2026-11-01", ["ana@x.cl"], "jefe@x.cl"),
    t("al-dia", "por_hacer", "2026-11-10", ["ana@x.cl"], "JEFE@x.cl"),
    t("sin-fecha", "por_hacer", null, ["beto@x.cl"], "jefe@x.cl"),
    t("terminada", "hecho", "2026-11-01", ["ana@x.cl"], "jefe@x.cl", "2026-10-30T15:00:00Z"),
    t("vieja", "hecho", "2026-10-01", ["ana@x.cl"], "jefe@x.cl", "2026-10-01T15:00:00Z"),
    t("propia", "por_hacer", "2026-11-01", ["jefe@x.cl"], "jefe@x.cl"),
    t("ajena", "por_hacer", "2026-11-01", ["ana@x.cl"], "otro@x.cl"),
  ], "jefe@x.cl", "2026-11-02");
  const ids = (l: { id: string }[]) => l.map((x) => x.id);
  assert.deepEqual(ids(r.vencidas), ["atrasada"]);
  assert.deepEqual(ids(r.pendientes), ["al-dia", "sin-fecha"], "las que vencen primero arriba; sin fecha al final");
  assert.deepEqual(ids(r.terminadas), ["terminada"], "solo las terminadas en los últimos 7 días");
  assert.equal(r.total, 3, "las que se asignó a sí mismo ya salen en «Mis tareas»");
}

// Toda Server Action exige la app antes de escribir.
const acciones = readFileSync("app/(protegido)/tareas/acciones.ts", "utf8");
const exportadas = acciones.match(/export async function \w+/g) ?? [];
assert.equal(exportadas.length, 8);
assert.equal((acciones.match(/await exigirAccesoApp\(SLUG_APP_TAREAS\)/g) ?? []).length, 8);

console.log("Tareas verificado: orden al mover, vencidas, migración alineada y 8 acciones con permiso, historial, notas y visibilidad.");
