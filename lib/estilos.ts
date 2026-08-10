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
