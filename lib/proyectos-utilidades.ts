// Helpers de fecha/color compartidos por los componentes cliente de
// /proyectos. Sin "server-only": corren en el navegador.

export const COLORES: Record<string, { bg: string; soft: string; edge: string; txt: string }> = {
  cobre: { bg: "#C85217", soft: "rgba(200,82,23,.18)", edge: "rgba(200,82,23,.55)", txt: "#fff" },
  teal: { bg: "#00A080", soft: "rgba(0,160,128,.18)", edge: "rgba(0,160,128,.55)", txt: "#fff" },
  acero: { bg: "#4A6FA5", soft: "rgba(74,111,165,.18)", edge: "rgba(74,111,165,.55)", txt: "#fff" },
  amarillo: { bg: "#D4A017", soft: "rgba(212,160,23,.18)", edge: "rgba(212,160,23,.55)", txt: "#1a1714" },
  violeta: { bg: "#7A5BAD", soft: "rgba(122,91,173,.18)", edge: "rgba(122,91,173,.55)", txt: "#fff" },
};
export const COLOR_OPTS = ["cobre", "teal", "acero", "amarillo", "violeta"];

export function colorDe(clave: string) {
  return COLORES[clave] ?? COLORES.cobre;
}

export function parseFecha(s: string | null | undefined): Date {
  if (!s) return new Date();
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isoFecha(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function sumarDias(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function mesAnio(): string {
  return new Date().toLocaleDateString("es-CL", { month: "long", year: "numeric" }).toUpperCase();
}

export function fmtMes(d: Date): string {
  return d.toLocaleDateString("es-CL", { month: "long" }).toUpperCase();
}

export function fmtFechaCorta(d: Date): string {
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}
