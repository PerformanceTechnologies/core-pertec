// Helpers de formato compartidos por los componentes cliente de /cotizador.
// Sin "server-only": corren en el navegador.

export function money(v: number): string {
  return "$" + Math.round(v).toLocaleString("es-CL");
}

export function pct(v: number, decimales = 1): string {
  return (v * 100).toFixed(decimales) + "%";
}

export function fechaCl(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}
