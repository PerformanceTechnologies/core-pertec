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

/**
 * La barra lateral, y el hueco que le deja el contenido.
 *
 * En desktop la barra es FIJA a la ventana, no `sticky` en el flujo. La diferencia
 * importa y se pagó caro: con `sticky`, la barra queda atada a la altura de su
 * contenedor, y ese contenedor NO cuenta a los elementos posicionados en absoluto
 * que sobresalen por abajo —los popover de Mi Día, un desplegable abierto al final
 * de una lista—. El documento entonces scrollea más de lo que mide el contenedor, y
 * al llegar al fondo la barra se suelta y sube esos pixeles: el logo se corta arriba
 * y abajo queda un hueco. Reproducido: 108 px de popover = 108 px de descuadre.
 *
 * Fija, la barra no depende de lo que haya en la página. El precio es que sale del
 * flujo y hay que dejarle el hueco a mano: eso es `HUECO_DE_BARRA`, que lee el ancho
 * que la propia barra publica en `--ancho-barra` (cambia al colapsarla).
 */
export const BARRA_FIJA =
  "fixed inset-y-0 left-0 z-50 lg:z-30 w-72 lg:w-64 lg:translate-x-0 transition-[width,transform] duration-200";

/**
 * El hueco que le deja el contenido a la barra fija: el ancho de la barra MÁS el
 * aire que el contenido siempre tuvo a los lados. Ver BARRA_FIJA.
 *
 * Incluye los cuatro paddings horizontales a propósito, y ninguno con la forma corta
 * `px-*`. Dos motivos, los dos vividos:
 *
 *  - `px-10` y `pl-[…]` en la misma clase compiten por padding-left, y quién gana lo
 *    decide el orden del CSS que genera Tailwind, no el orden en que se escriben. Ganó
 *    `pl-[…]`, el contenido quedó pegado a la barra sin nada de aire y el botón de
 *    colapsar —que sobresale 12 px— caía encima del título.
 *  - Si el hueco y el ancho viven en dos clases distintas, alguien los separa y el
 *    contenido termina debajo de la barra.
 */
export const HUECO_DE_BARRA =
  "pl-6 pr-6 lg:pr-10 lg:pl-[calc(var(--ancho-barra,16rem)+2.5rem)] transition-[padding] duration-200";
