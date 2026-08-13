// Clave de match entre las distintas fuentes de un mismo documento (RCV,
// listado del portal MIPYME, fila en Supabase): folio + rut de la
// contraparte, limpio de puntos/guiones para no fallar por formato. Vive en
// su propio archivo (sin "server-only") porque lo usan tanto modulos de
// scraping como la capa de datos, sin que ninguno dependa del otro.
export function claveDocumento(folio: number, rutContraparte: string): string {
  return `${folio}|${rutContraparte.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase()}`;
}
