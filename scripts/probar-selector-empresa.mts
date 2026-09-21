/**
 * Elegir empresa en el selector del portal MIPYME del SII.
 *
 * Correr con:  npm run probar-selector-empresa
 *
 * Lo que se prueba es la distinción que faltaba y que costó una corrida entera:
 *
 *   El 21-09-2026 la sincronización de Facturas IH murió con "No se encontro la empresa
 *   77031094-6 en el selector del SII", y era mentira. La empresa estaba; lo que no
 *   había era el <select>, porque el código leía el DOM sin esperarlo. Dos situaciones
 *   muy distintas —el SII lento, que se arregla solo, y una cuenta que de verdad no
 *   representa a esa empresa, que hay que ir a arreglar— daban el mismo mensaje.
 *
 * Y además: que el match sea por RUT y no por nombre, que tolere el formato con puntos
 * y guion, y que con varias opciones NUNCA elija una al azar.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { elegirEmpresa, type OpcionDeEmpresa } from "../lib/finanzas-ih/selector-empresa";

// Los rótulos son los que devuelve el SII: razón social y RUT con puntos.
const IH: OpcionDeEmpresa = { value: "1", text: "INVERSIONES HARRIS LTDA 77.031.094-6" };
const IL: OpcionDeEmpresa = { value: "2", text: "INVERSIONES LOS ANDES SPA 76.929.210-1" };

// ── Lo que rompió la corrida ─────────────────────────────────────────────────

const sinCombo = elegirEmpresa([], "77031094-6");
assert.equal(
  sinCombo.estado,
  "sin_selector",
  "lista vacía es 'el SII no mostró el combo', NO 'la empresa no existe': es el error que " +
    "se reportó el 21-09-2026 y mandaba a buscar el problema al lado equivocado",
);
assert.ok(
  sinCombo.estado === "sin_selector" && /resolverse en la corrida siguiente/i.test(sinCombo.mensaje),
  "y tiene que decir que es transitorio, porque lo es",
);

const noEsta = elegirEmpresa([IL], "77031094-6");
assert.equal(
  noEsta.estado,
  "elegida",
  "con UNA sola opción se toma esa aunque el RUT no calce: el SII a veces manda el " +
    "selector sin el RUT en el rótulo. Es el comportamiento que ya tenía",
);

const noEstaDeVerdad = elegirEmpresa([IL, { value: "3", text: "OTRA EMPRESA SPA 11.111.111-1" }], "77031094-6");
assert.equal(
  noEstaDeVerdad.estado,
  "no_esta",
  "con VARIAS opciones y ninguna que calce, sí es un problema de configuración",
);
assert.ok(
  noEstaDeVerdad.estado === "no_esta" && noEstaDeVerdad.mensaje.includes("INVERSIONES LOS ANDES"),
  "y el mensaje lista lo que el SII SÍ ofreció: sin eso hay que entrar al SII a mano para " +
    "ver qué había del otro lado",
);

// ── Match por RUT, no por nombre ─────────────────────────────────────────────

for (const escrito of ["77031094-6", "77.031.094-6", "770310946", "77031094-K".replace("K", "6")]) {
  const r = elegirEmpresa([IH, IL], escrito);
  assert.ok(
    r.estado === "elegida" && r.opcion.value === "1",
    `"${escrito}" tiene que encontrar a Harris: el RUT viaja con y sin puntos según de dónde salga`,
  );
}

const conVerificadorK = elegirEmpresa(
  [{ value: "9", text: "EMPRESA CON K 12.345.678-K" }, IL],
  "12345678-K",
);
assert.ok(
  conVerificadorK.estado === "elegida" && conVerificadorK.opcion.value === "9",
  "el verificador K no se pierde al normalizar",
);

// Nunca elegir la primera de varias por descarte.
const variasNingunaCalza = elegirEmpresa([IH, IL], "99999999-9");
assert.equal(
  variasNingunaCalza.estado,
  "no_esta",
  "con varias opciones y ninguna que calce NO se elige una al azar: sincronizar la empresa " +
    "equivocada mezcla los documentos de dos contribuyentes, que es peor que no sincronizar",
);

// ── Que el IO espere el combo ────────────────────────────────────────────────

const guias = readFileSync(new URL("../lib/finanzas-ih/sii-guias-ih.ts", import.meta.url), "utf8");
assert.ok(
  /waitForSelector\("select"/.test(guias),
  "seleccionarEmpresa tiene que ESPERAR al <select>: leer el DOM apenas pasa " +
    "domcontentloaded es lo que produjo la lista vacía",
);
assert.ok(
  guias.includes("elegirEmpresa("),
  "y la decisión tiene que salir de acá, no repetirse a mano en el archivo del navegador",
);
assert.ok(
  !/No se encontro la empresa \$\{rutEmpresa\}/.test(guias),
  "el mensaje viejo —el que mentía— no puede seguir en el código",
);

// ── Que un fallo de guías no descarte lo del RCV ─────────────────────────────

const sincronizar = readFileSync(new URL("../lib/finanzas-ih/sincronizar.ts", import.meta.url), "utf8");
const posGuias = sincronizar.indexOf("extraerGuiasYCodigosIh(");
const posGuardar = sincronizar.indexOf("guardarDocumentosIh(documentos)");
assert.ok(posGuias > 0 && posGuardar > posGuias, "el guardado sigue después de las guías");
assert.ok(
  /catch \(err\) \{\s*\n\s*falloGuias = err;/.test(sincronizar),
  "las guías van en su propio try: si revientan, lo que ya trajo el RCV tiene que guardarse " +
    "igual. El 21-09-2026 se perdieron 33 documentos ya leídos por no hacer esto",
);
assert.ok(
  /registrarEjecucionIh\(false, nuevos, archivosSubidos, mensaje\)/.test(sincronizar),
  "y la ejecución fallida se registra con los contadores REALES de lo que entró, no con 0",
);
assert.ok(
  /yaRegistradas\.has\(err\)/.test(sincronizar),
  "sin esta guarda, relanzar el error escribía una segunda fila con 0 y 0 encima de la buena",
);

console.log(
  "Selector de empresa del SII: combo ausente vs empresa ausente, match por RUT, y que un " +
    "fallo de guías no se lleve lo que ya trajo el RCV, todo verificado.",
);
