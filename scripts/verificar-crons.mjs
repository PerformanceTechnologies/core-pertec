// Verifica que ningún cron de vercel.json corra más de una vez al día.
//
// El plan Hobby de Vercel lo exige: una expresión que corra más seguido hace
// FALLAR EL DEPLOY completo, no la ejecución. Y el error aparece recién en Vercel,
// después de commitear y pushear, cuando ya es tarde.
//
// Pasó de verdad: "30 10-19 * * 1-5" (diez corridas diarias) tumbó un deploy. Para
// conseguir varias corridas al día hay que agendar entradas SEPARADAS, cada una
// una vez al día — en Hobby caben hasta 100 por proyecto.
//
//   node scripts/verificar-crons.mjs
import { readFileSync } from "node:fs";

const UNA_VEZ = /^\d{1,2}$/; // un solo valor: ni *, ni rango, ni lista, ni paso

const { crons = [] } = JSON.parse(readFileSync("vercel.json", "utf8"));
const problemas = [];

for (const { path, schedule } of crons) {
  const campos = String(schedule).trim().split(/\s+/);
  if (campos.length !== 5) {
    problemas.push(`${schedule}  (${path}) — no tiene 5 campos`);
    continue;
  }
  const [minuto, hora] = campos;
  // Solo minuto y hora deciden cuántas veces por DÍA corre. Los otros tres campos
  // (día del mes, mes, día de la semana) solo pueden reducir la frecuencia.
  if (!UNA_VEZ.test(minuto) || !UNA_VEZ.test(hora)) {
    problemas.push(`${schedule}  (${path}) — corre más de una vez al día`);
  }
}

if (problemas.length > 0) {
  console.error(`${problemas.length} cron(s) que el plan Hobby va a rechazar al desplegar:\n`);
  problemas.forEach((p) => console.error(`  ${p}`));
  process.exit(1);
}

console.log(`${crons.length} cron(s), todos una vez al día como máximo:`);
crons.forEach((c) => console.log(`  ${c.schedule.padEnd(14)} ${c.path}`));
