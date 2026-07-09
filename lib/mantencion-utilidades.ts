// Helpers de mantención compartidos por los componentes cliente. Sin
// "server-only": corren en el navegador.

export const MED_FIELDS = [
  { k: "tiempo_levante", l: "Tiempo de levante", u: "min", ph: "ej: 45" },
  { k: "temp_inicial", l: "Temperatura inicial", u: "°C", ph: "ej: 120" },
  { k: "temp_objetivo", l: "Temperatura objetivo", u: "°C", ph: "ej: 150" },
  { k: "psi", l: "Presión", u: "PSI", ph: "ej: 90" },
] as const;

// Los ítems de temperatura/levante exigen los 4 campos de medición antes de
// poder marcarse como hechos — regla del dominio de vulcanizado, igual que
// en el panel original.
export function requiereMedicionTemp(titulo: string): boolean {
  const t = (titulo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return t.includes("temperatura") || t.includes("levante");
}

export function medicionCompleta(medicion: Record<string, string> | null | undefined): boolean {
  if (!medicion) return false;
  return MED_FIELDS.every((f) => medicion[f.k] != null && String(medicion[f.k]).trim() !== "");
}

export const ESTADO_EQUIPO_LABEL: Record<string, string> = {
  operativo: "Operativo",
  mantencion: "En mantención",
  revision: "En revisión",
  fuera_servicio: "Fuera de servicio",
};

export const ESTADOS_EQUIPO = ["operativo", "mantencion", "revision", "fuera_servicio"] as const;

// Mismos colores por estado que el panel original (pn-estado-pill).
export const ESTADO_EQUIPO_COLOR: Record<string, { bg: string; texto: string; borde: string }> = {
  operativo: { bg: "rgba(0,160,128,.10)", texto: "#007a62", borde: "rgba(0,160,128,.3)" },
  mantencion: { bg: "rgba(212,160,23,.10)", texto: "#b58900", borde: "rgba(212,160,23,.35)" },
  revision: { bg: "rgba(74,111,165,.10)", texto: "#4A6FA5", borde: "rgba(74,111,165,.3)" },
  fuera_servicio: { bg: "rgba(220,38,38,.10)", texto: "#b91c1c", borde: "rgba(220,38,38,.3)" },
};
