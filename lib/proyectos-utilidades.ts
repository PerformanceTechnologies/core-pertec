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

export function fmtCLP(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(n));
}

// Categorías y tags de gasto — igual que el panel original. La key se guarda
// en el jsonb; el label es lo que se muestra. Tags vacío => entrada libre.
export const GASTO_CATEGORIAS = [
  { v: "alimentacion", l: "Alimentación", tags: ["Desayuno", "Almuerzo", "Cena", "Mixta"] },
  { v: "traslados", l: "Traslados", tags: ["Pasajes terrestres", "Vuelos", "Combustible", "Tag y peajes"] },
  { v: "alojamiento", l: "Alojamiento", tags: ["Hotel", "Arriendo pieza"] },
  { v: "operacionales", l: "Gastos operacionales", tags: ["Compra de suministros"] },
  { v: "horas_hombre", l: "Horas/Hombre", tags: ["Día", "Semana", "Mes"] },
  { v: "urgencias", l: "Urgencias e imprevistos", tags: [] as string[] },
] as const;

export function catLabel(v: string | null): string {
  return GASTO_CATEGORIAS.find((c) => c.v === v)?.l || v || "Sin categoría";
}

export function catTags(v: string | null): readonly string[] {
  return GASTO_CATEGORIAS.find((c) => c.v === v)?.tags ?? [];
}

// Color de la paleta de proyectos (cobre/teal/acero/amarillo/violeta) para
// cada categoría de gasto — mismo mapeo que el panel original.
export const CAT_COLOR: Record<string, string> = {
  alimentacion: "cobre",
  traslados: "teal",
  alojamiento: "acero",
  operacionales: "amarillo",
  horas_hombre: "violeta",
  urgencias: "cobre",
  sin_categoria: "cobre",
};

export function costoConcepto(g: { categoria: string | null; tag: string | null; label: string | null }): string {
  const partes = [];
  if (g.categoria) partes.push(catLabel(g.categoria));
  if (g.tag) partes.push(g.tag);
  if (partes.length === 0) return (g.label || "").trim() || "Sin concepto";
  return partes.join(" · ");
}

export const ESTADOS_PROYECTO = ["no_iniciado", "en_curso", "terminado"] as const;

export const ESTADO_PROYECTO_LABEL: Record<string, string> = {
  no_iniciado: "No iniciado",
  en_curso: "En curso",
  terminado: "Terminado",
};

export const ESTADO_PROYECTO_COLOR: Record<string, { bg: string; texto: string; borde: string }> = {
  no_iniciado: { bg: "rgba(140,133,120,.12)", texto: "#716f6d", borde: "rgba(140,133,120,.3)" },
  en_curso: { bg: "rgba(200,82,23,.10)", texto: "#C85217", borde: "rgba(200,82,23,.3)" },
  terminado: { bg: "rgba(0,160,128,.10)", texto: "#007a62", borde: "rgba(0,160,128,.3)" },
};
