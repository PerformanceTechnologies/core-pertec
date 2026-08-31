/**
 * El compromiso del resumen diario: todos con su correo antes de las 9.
 *
 * Correr con:  npm run probar-resumen
 *
 * Se probaron las dos mitades de lo que hace que se cumpla, porque son dos problemas
 * distintos y ninguna alcanza sola:
 *
 *  1. Que la corrida QUEPA: las personas se procesan de a varias en paralelo, con
 *     tope por persona y tope de corrida. Antes iban una tras otra y con 8 personas a
 *     20–60 s cada una se pasaba del tope de la función, que la mataba a mitad de
 *     camino y dejaba a los que faltaban para el cron siguiente —dos horas después—.
 *  2. Que HAYA VARIOS INTENTOS antes de las 9: los crons de Vercel se atrasan hasta
 *     una hora y una corrida puede fallar entera. Eso no se arregla con código: se
 *     arregla con el agendado, y por eso la aritmética del agendado también se
 *     comprueba acá, contra vercel.json.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { conTope, enTandas } from "../lib/resumen-diario/tandas";

// ── 1. De a varios, sin pasarse ──────────────────────────────────────────────
{
  let simultaneas = 0;
  let maximoSimultaneas = 0;
  const orden: number[] = [];

  const resultados = await enTandas([10, 20, 30, 40, 50, 60, 70, 80], 3, async (valor, i) => {
    simultaneas += 1;
    maximoSimultaneas = Math.max(maximoSimultaneas, simultaneas);
    // Los primeros tardan más que los últimos: es lo que descubre un "paralelo" que
    // en realidad espera a que termine cada tanda completa antes de seguir.
    await new Promise((listo) => setTimeout(listo, 40 - i * 4));
    simultaneas -= 1;
    orden.push(valor);
    return valor * 2;
  });

  assert.equal(maximoSimultaneas, 3, `nunca más de 3 a la vez (llegó a ${maximoSimultaneas})`);
  assert.deepEqual(
    resultados,
    [20, 40, 60, 80, 100, 120, 140, 160].map((valor) => ({ estado: "ok", valor })),
    "los resultados salen en el orden de entrada, no en el de llegada",
  );
  assert.notDeepEqual(orden, [10, 20, 30, 40, 50, 60, 70, 80], "y de verdad terminaron desordenados");
}

// Una persona que falla no le quita el resumen al resto: es la razón de que cada una
// vaya en su propio try. Antes de esto, un buzón roto cortaba la corrida.
{
  const resultados = await enTandas(["a", "b", "c"], 2, async (letra) => {
    if (letra === "b") throw new Error("buzón roto");
    return letra.toUpperCase();
  });
  assert.deepEqual(resultados[0], { estado: "ok", valor: "A" });
  assert.deepEqual(
    resultados[1] !== "no_empezado" ? resultados[1].estado : "no_empezado",
    "falló",
    "la que lanza queda marcada como fallida, no como no empezada",
  );
  assert.deepEqual(resultados[2], { estado: "ok", valor: "C" }, "la que venía después igual se procesó");
}

// El presupuesto de la corrida: se deja de EMPEZAR gente, y los que no empezaron se
// distinguen de los que fallaron —a unos los toma el próximo intento, a los otros hay
// que mirarlos—.
{
  let empezadas = 0;
  const resultados = await enTandas(
    [1, 2, 3, 4, 5, 6],
    2,
    async (n) => {
      empezadas += 1;
      await new Promise((listo) => setTimeout(listo, 20));
      return n;
    },
    { seguir: () => empezadas < 4 },
  );
  assert.equal(empezadas, 4, "se cortó cuando dijo el presupuesto");
  assert.equal(resultados.filter((r) => r === "no_empezado").length, 2, "y los que no empezaron se marcan");
}

// ── 2. El tope por persona ───────────────────────────────────────────────────
{
  const rapido = await conTope(200, Promise.resolve("listo"), "algo");
  assert.equal(rapido, "listo");

  await assert.rejects(
    () => conTope(30, new Promise((listo) => setTimeout(() => listo("tarde"), 400)), "el resumen de ana@x.cl"),
    /el resumen de ana@x\.cl tardó más de 0 s/,
    "el tope explica QUÉ se colgó: en el log del cron es la diferencia entre saber y adivinar",
  );

  // Y no deja un timer colgado, que en una función serverless mantiene el proceso
  // vivo y se paga como tiempo de ejecución.
  const antes = process.getActiveResourcesInfo?.().filter((r) => r === "Timeout").length ?? 0;
  await conTope(5_000, Promise.resolve(1), "algo");
  const despues = process.getActiveResourcesInfo?.().filter((r) => r === "Timeout").length ?? 0;
  assert.ok(despues <= antes, "el reloj se limpia cuando el trabajo llega primero");
}

// ── 3. La aritmética del agendado ────────────────────────────────────────────
//
// Esto no prueba código: prueba que vercel.json cumpla el compromiso. Si alguien saca
// una entrada o la corre más tarde, acá se ve.
const HORA_COMPROMISO = 9;
/** Lo que Vercel puede atrasarse. Medido en esta instalación: hasta 52 minutos. */
const ATRASO_MAXIMO_MIN = 59;
/** Chile es UTC-4 en invierno y UTC-3 en verano: el cron corre en UTC fijo. */
const HUSOS = [-4, -3];

// Los dos números que decide la ruta se LEEN de la ruta, no se copian: una copia se
// desactualiza en silencio y la prueba pasaría contra valores que ya no existen.
const rutaCron = readFileSync(
  new URL("../app/api/cron/resumen-diario/route.ts", import.meta.url),
  "utf8",
);
const leerConstante = (nombre: string): number => {
  const encontrado = new RegExp(`const ${nombre} = ([0-9_]+)`).exec(rutaCron);
  assert.ok(encontrado, `no se encontró ${nombre} en la ruta del cron`);
  return Number(encontrado[1].replace(/_/g, ""));
};
const HORA_MINIMA_CHILE = leerConstante("HORA_MINIMA_CHILE");
/** Lo que la corrida puede durar antes de cortarse sola. */
const DURACION_MAX_MIN = Math.ceil(leerConstante("TOPE_DE_CORRIDA_MS") / 60_000);
assert.equal(leerConstante("HORA_COMPROMISO_CHILE"), HORA_COMPROMISO, "el compromiso de la ruta es otro");

interface Cron {
  path: string;
  schedule: string;
}
const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
  crons: Cron[];
};
const delResumen = config.crons.filter((c) => c.path.startsWith("/api/cron/resumen-diario"));
assert.ok(delResumen.length >= 3, `el resumen necesita varios intentos y tiene ${delResumen.length}`);

for (const huso of HUSOS) {
  const aTiempo: string[] = [];
  for (const cron of delResumen) {
    const [minuto, hora] = cron.schedule.split(" ").map(Number);
    const arranqueLocal = hora * 60 + minuto + huso * 60;
    const finPeorCaso = arranqueLocal + ATRASO_MAXIMO_MIN + DURACION_MAX_MIN;

    // Ninguna corrida puede caer antes de la ventana: se descartaría a sí misma.
    assert.ok(
      arranqueLocal >= HORA_MINIMA_CHILE * 60,
      `la corrida de ${cron.schedule} arranca a las ${Math.floor(arranqueLocal / 60)}:${String(arranqueLocal % 60).padStart(2, "0")} de Chile (UTC${huso}), antes de que abra la ventana de las ${HORA_MINIMA_CHILE}:00: se descartaría sola`,
    );
    if (finPeorCaso < HORA_COMPROMISO * 60) aTiempo.push(cron.schedule);
  }

  assert.ok(
    aTiempo.length >= 3,
    `con UTC${huso} solo ${aTiempo.length} intento(s) terminan seguro antes de las ${HORA_COMPROMISO}:00 ` +
      `(hacen falta 3, contando ${ATRASO_MAXIMO_MIN} min de atraso de Vercel y ${DURACION_MAX_MIN} de corrida). ` +
      `Sirven: ${aTiempo.join(", ") || "ninguno"}`,
  );
  console.log(`UTC${huso}: ${aTiempo.length} intentos llegan seguro antes de las ${HORA_COMPROMISO}:00`);
}

console.log("Todas las verificaciones pasaron.");
