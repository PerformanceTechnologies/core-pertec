// Clases de Tailwind compartidas entre módulos. Sin "server-only": las usan
// componentes cliente y de servidor por igual.

/**
 * Sombra cálida, no negra.
 *
 * La paleta del core es cálida (crema #faf8f5 sobre tinta #171411) y una sombra
 * de negro puro al 10% encima de ese crema se ve gris sucio. Tintada con el mismo
 * tinta queda como una sombra de verdad.
 *
 * Dos capas: una de contacto de 1px y una difusa y alta. Es lo que hace que todas
 * las tarjetas parezcan iluminadas por la misma fuente, en vez de tener cada una
 * su propio halo.
 *
 * Vive acá y no en cada módulo porque la usan Mi Día y Rendir Gastos, y dos
 * definiciones de la misma sombra se separan a la primera que alguien ajuste.
 */
export const SOMBRA_CALIDA = "shadow-[0_1px_2px_rgba(23,20,17,0.04),0_10px_28px_-14px_rgba(23,20,17,0.12)]";

/**
 * La tarjeta del core: borde, superficie y la sombra de arriba.
 *
 * Existe porque la misma combinación estaba escrita a mano en Cotizador, Rendir
 * Gastos, Mi Día y Proyectos, y en Proyectos había derivado en otra cosa
 * (`bg-white` con `shadow-[0_20px_40px_rgba(12,10,9,.08)]`), que sobre el crema
 * se ve como una tarjeta flotando en otro plano que las demás.
 */
export const TARJETA = `rounded-xl border border-borde bg-superficie ${SOMBRA_CALIDA}`;

/**
 * El botón de acción principal.
 *
 * Radio de 8px y no una píldora: la píldora con mayúsculas, tracking ancho y
 * sombra naranja se usaba para "+ Nuevo objetivo" y también para "Ver detalle",
 * y con seis píldoras en pantalla ninguna se leía como la acción principal.
 *
 * Sin `hover:-translate-y-px`: un botón que se levanta al pasar el mouse mueve
 * el texto de al lado cuando está dentro de una fila apretada.
 */
export const BOTON_PRIMARIO =
  "rounded-lg bg-naranjo px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-naranjo-suave focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo";

/** El mismo botón, para acciones secundarias dentro de una tarjeta. */
export const BOTON_PRIMARIO_CHICO =
  "rounded-lg bg-naranjo px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-naranjo-suave focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo";
