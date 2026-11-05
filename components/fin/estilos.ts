// Clases de botones y campos de Gestión financiera, en un archivo SIN "use client".
//
// Vivían en ui.tsx, que es de cliente: una página de servidor que las importa desde ahí recibe una
// referencia, no el texto. Pasarla tal cual como prop a un componente de cliente funciona, pero
// pegarla a otra clase en el servidor (`${BOTON_SEC} ml-1`) la convierte en texto basura y el
// elemento queda sin estilo (pasó con «Imprimir» y «Ceder»).
import { CAMPO_FIN } from "@/lib/estilos";

export const BOTON =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-naranjo px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave disabled:opacity-50";
export const BOTON_SEC =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 py-2 text-xs font-semibold text-tinta transition hover:border-naranjo/50 disabled:opacity-50";
export const CAMPO = CAMPO_FIN;
