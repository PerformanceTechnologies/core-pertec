// Clases de Tailwind compartidas. Sin "server-only": las usan componentes
// cliente y de servidor por igual.

/**
 * Sombra azulada, no negra.
 *
 * La paleta es fría (fondo #f4f7fb con tinta #0f1c33) y una sombra de negro puro
 * sobre ese fondo se ve como suciedad gris. Tintada con el mismo azul de la
 * tinta queda como una sombra de verdad.
 *
 * Dos capas: una de contacto de 1px y una difusa y alta. Es lo que hace que
 * todas las tarjetas parezcan iluminadas por la misma fuente en vez de tener
 * cada una su propio halo.
 */
export const SOMBRA_AZUL =
  "shadow-[0_1px_2px_rgba(15,28,51,0.04),0_10px_28px_-14px_rgba(15,28,51,0.14)]";

/** La tarjeta del core: borde, superficie y la sombra de arriba. */
export const TARJETA = `rounded-xl border border-borde bg-superficie ${SOMBRA_AZUL}`;

/**
 * El botón de acción principal.
 *
 * Radio de 8px y no una píldora: con varias píldoras en pantalla ninguna se lee
 * como la acción principal.
 */
export const BOTON_PRIMARIO =
  "min-h-11 rounded-lg bg-azul px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul";

export const CAMPO =
  "min-h-11 w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm text-tinta placeholder:text-gris-suave focus:border-cian focus:outline-none focus:ring-2 focus:ring-cian/30";

/**
 * Un campo más bajo, para barras de filtros: 40 px con mouse y los 44 de siempre con el dedo
 * (`pointer-coarse`). El campo normal mide 44 siempre, y en una fila de filtros que se ve en
 * cada visita a una lista, esos 4 píxeles por campo suman espacio que no se usa.
 */
export const CAMPO_COMPACTO =
  "min-h-10 pointer-coarse:min-h-11 w-full rounded-lg border border-borde bg-superficie px-3 py-1.5 text-sm text-tinta placeholder:text-gris-suave focus:border-cian focus:outline-none focus:ring-2 focus:ring-cian/30";

/**
 * La barra lateral, y el hueco que le deja el contenido.
 *
 * La barra es FIJA a la ventana, no `sticky` en el flujo. La diferencia importa:
 * con `sticky` queda atada a la altura de su contenedor, y ese contenedor no
 * cuenta los elementos posicionados en absoluto que sobresalen por abajo —un
 * desplegable abierto al final de una lista, el visor de un documento—. El
 * documento entonces scrollea más de lo que mide el contenedor, y al llegar al
 * fondo la barra se suelta y sube esos píxeles: el logo se corta arriba y abajo
 * queda un hueco.
 *
 * El precio de ser fija es que sale del flujo y hay que dejarle el hueco a mano:
 * eso es HUECO_DE_BARRA, que lee el ancho que la propia barra publica en
 * `--ancho-barra`.
 */
export const BARRA_FIJA =
  "fixed inset-y-0 left-0 z-50 w-72 border-r border-borde bg-superficie transition-[width,transform] duration-200 lg:z-30 lg:w-[var(--ancho-barra)] lg:translate-x-0";

export const HUECO_DE_BARRA = "px-4 sm:px-6 lg:pl-[calc(var(--ancho-barra)+2rem)] lg:pr-8";
