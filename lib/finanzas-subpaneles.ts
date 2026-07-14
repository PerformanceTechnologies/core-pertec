// Catalogo de sub-paneles dentro de Panel Finanzas. A diferencia del catalogo
// de aplicaciones (tabla `aplicaciones` en Supabase, pensado para apps de
// primer nivel del core), este vive en codigo porque es una lista interna de
// Finanzas que se espera crezca a medida que se agreguen mas areas.
export interface SubpanelFinanzas {
  slug: string;
  nombre: string;
  descripcion: string;
  href: string;
  icono: string; // clave de lib/iconos.tsx
}

export const SUBPANELES_FINANZAS: SubpanelFinanzas[] = [
  {
    slug: "sii",
    nombre: "Facturas de Compra y Venta",
    descripcion: "Registro de Compras y Ventas del Servicio de Impuestos Internos (SII), actualizado todos los dias.",
    href: "/finanzas/sii",
    icono: "file-invoice",
  },
];
