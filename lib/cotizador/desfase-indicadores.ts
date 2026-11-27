// Qué tan atrasadas vienen la UF y la UTM de la fuente respecto de hoy (hora de Chile).
//
// Sin "server-only" a propósito: son funciones puras y así se pueden probar con tsx.
//
// El cron diario guarda lo que la fuente (findic.cl) entrega, y la fuente puede publicar el día
// nuevo más tarde que las 03:00. Si eso pasa, el cotizador queda con la UF de ayer sin que nadie
// se entere: el cron igual termina «bien». Esto sirve para detectarlo.

/** AAAA-MM-DD de hoy en Chile. */
export function hoyEnChile(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

const FECHA = /^\d{4}-\d{2}-\d{2}/;

/**
 * Lo que viene atrasado, en texto para el aviso; lista vacía si está al día.
 *
 * La UF cambia todos los días: está atrasada si su fecha es anterior a hoy. La UTM cambia una
 * vez al mes (su fecha es el primer día de su mes): está atrasada si es de un mes anterior al
 * actual. Una fecha que no se puede leer también se avisa, porque no hay cómo saber si está al día.
 */
export function atrasosUfUtm(fechaUf: string, fechaUtm: string, hoy: string): string[] {
  const atrasos: string[] = [];

  if (!FECHA.test(fechaUf)) atrasos.push("UF sin fecha legible");
  else if (fechaUf.slice(0, 10) < hoy) atrasos.push(`UF del ${fechaUf.slice(0, 10)} (hoy es ${hoy})`);

  if (!FECHA.test(fechaUtm)) atrasos.push("UTM sin fecha legible");
  else if (fechaUtm.slice(0, 7) < hoy.slice(0, 7)) atrasos.push(`UTM de ${fechaUtm.slice(0, 7)} (estamos en ${hoy.slice(0, 7)})`);

  return atrasos;
}
