import type { ColorApp, EstadoApp } from "./tipos";

export function clasesInsigniaColor(color: ColorApp): string {
  switch (color) {
    case "naranjo":
      return "bg-naranjo/10 text-naranjo";
    case "teal":
      return "bg-teal/10 text-teal";
    case "gris":
      return "bg-gris/10 text-gris";
  }
}

export const ESTADOS: { valor: EstadoApp; etiqueta: string }[] = [
  { valor: "activa", etiqueta: "Activa" },
  { valor: "en_desarrollo", etiqueta: "En desarrollo" },
  { valor: "mantenimiento", etiqueta: "Mantención" },
];

export function clasesInsigniaEstado(estado: EstadoApp): string {
  switch (estado) {
    case "activa":
      return "bg-teal/10 text-teal";
    case "en_desarrollo":
      return "bg-naranjo-suave/15 text-naranjo";
    case "mantenimiento":
      return "bg-gris/15 text-gris";
  }
}

export function etiquetaEstado(estado: EstadoApp): string {
  return ESTADOS.find((e) => e.valor === estado)?.etiqueta ?? estado;
}
