// El repositorio de apoyo de un contrato: material de consulta que acompaña a los requisitos.
//
// Sin "server-only" a propósito: el nombre lo usan el servidor (para ubicar la carpeta y dejarla
// fuera del avance) y los componentes que dibujan la fila y la página.

/** Cómo se llama en pantalla. */
export const NOMBRE_DEL_REPOSITORIO = "Repositorio de apoyo";

/**
 * La carpeta en SharePoint: de PRIMER nivel, dentro de la carpeta del contrato y hermana de
 * LOGISTICA y GASTOS ARRANQUE.
 *
 * Fuera de DOCUMENTOS GENERALES a propósito. Todo lo que cuelga de esa carpeta es un requisito y
 * cuenta en el avance; el repositorio es consulta, no se entrega, y no debe sumar ni restar en
 * ninguna cifra. Como carpeta de primer nivel se esconde con `estaOculta` (ver sharepoint.ts), el
 * mismo filtro que ya deja fuera a Logística y Gastos de la portada, del dashboard y del avance.
 */
export const CARPETA_DEL_REPOSITORIO = "REPOSITORIO DE APOYO";

/** El tramo de la dirección: /contratos/<contrato>/repositorio-de-apoyo. */
export const RUTA_DEL_REPOSITORIO = "repositorio-de-apoyo";
