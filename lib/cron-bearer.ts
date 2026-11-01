import { timingSafeEqual } from "node:crypto";

/**
 * Si la cabecera `Authorization` de un cron trae `Bearer <secreto>`.
 *
 * La comparación es en tiempo constante: con `===` el tiempo de respuesta depende de cuántos
 * caracteres iniciales coinciden, y eso permite adivinar el secreto de a un carácter.
 * Un secreto ausente o vacío nunca coincide (los llamadores ya lo descartan antes).
 */
export function bearerCoincide(recibido: string | null, secreto: string): boolean {
  if (!secreto) return false;
  const a = Buffer.from(recibido ?? "");
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
