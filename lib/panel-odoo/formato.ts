// Helpers de formato compartidos por las tarjetas de Panel Odoo. Sin
// "server-only": los usan tanto Server Components (las tarjetas) como el
// badge de sincronizacion.

export function haceCuanto(iso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} d`;
}

export interface Variacion {
  pct: number;
  disponible: boolean;
}

// null cuando no hay mes anterior con el que comparar (ej. recien empezando
// a sincronizar) -- distinto de una variacion real de 0%.
export function calcularVariacion(actual: number, anterior: number): Variacion | null {
  if (anterior === 0) return null;
  return { pct: ((actual - anterior) / Math.abs(anterior)) * 100, disponible: true };
}
