// Motor de cálculo del Cotizador — port de packages/engine (repo standalone
// "Webapp Cotizador"), sin cambios de lógica. Los parámetros legales ya no se
// leen de una constante hardcodeada: vienen de `parametros-legales.ts`
// (tabla public.parametros_legales_sets), o del snapshot congelado de cada
// cotización ya creada (public.cotizaciones.parametros_snapshot).
//
// Nota: el resto del código (lib/cotizador.ts) importa directo de los
// submódulos en vez de este barrel, para evitar un problema de resolución de
// `export *` observado con el loader ESM nativo de Node (no así con el
// bundler de Next). Este archivo queda como punto de entrada de referencia.
export type * from "./types";
export * from "./round";
export * from "./numeroATexto";
export * from "./remuneraciones";
export * from "./costos";
export * from "./consolidacion";
