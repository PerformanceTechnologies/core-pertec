// Sin "server-only": corre en el navegador, para ids de filas nuevas
// (dotación, costos, equipos, vehículos) mientras se edita el editor.
let idSeq = 0;

export function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${idSeq}-${Math.round(Math.random() * 1e6).toString(36)}`;
}
