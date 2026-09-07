// El tema claro/oscuro: la clave de localStorage y el evento con el que la pestaña se
// avisa a si misma. Viven aca y no en BarraLateral.tsx porque los graficos de ApexCharts
// tambien tienen que saber el tema -- Apex pinta colores fijos en el SVG, no variables
// CSS, asi que necesita volver a dibujar cuando el tema cambia -- e importarlos del
// componente arrastraria toda la barra lateral al chunk de los graficos.
//
// Sin "server-only": los usan componentes cliente.

export const CLAVE_TEMA = "core-tema";
export const EVENTO_TEMA = "core-tema-cambio";

export type Tema = "light" | "dark";

/**
 * El tema actual, leido del atributo que BarraLateral estampa en <html>.
 *
 * Del atributo y no de localStorage: el script sin-flash de app/layout.tsx lo pone antes
 * de que corra React, asi que es la fuente que ya esta bien en la primera pintada.
 */
export function temaActual(): Tema {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/** Mismo patron que el resto del core: localStorage no avisa a la pestaña que escribe. */
export function suscribirseAlTema(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENTO_TEMA, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENTO_TEMA, callback);
  };
}
