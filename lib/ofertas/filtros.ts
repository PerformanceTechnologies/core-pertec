import type { OfertaResumen } from "./datos";

/**
 * Buscar y filtrar el listado de ofertas.
 *
 * Sin "server-only" y sin React: lo usa la tabla en el navegador —el listado ya
 * viene entero, así que filtrar es instantáneo y no hace falta ir al servidor por
 * cada tecla— y así la regla se puede probar sin abrir la pantalla.
 *
 * Lo que se busca es lo que uno recuerda de una oferta: el número, el servicio, el
 * cliente, la faena. Y para el admin —el único que ve las de todos— también el
 * nombre de quien la creó, que es cómo se queda con las de una sola persona sin
 * agregar otro control.
 */

export interface FiltrosDeOfertas {
  texto: string;
  /** "todas" o el nombre de la empresa emisora. */
  empresa: string;
  /** "todos" | "borrador" | "emitida" */
  estado: string;
  /** Solo las que tienen algo por revisar. */
  soloPorRevisar: boolean;
  /** Fechas de modificación, en formato "aaaa-mm-dd". Vacías = sin tope. */
  desde: string;
  hasta: string;
}

export const FILTROS_VACIOS: FiltrosDeOfertas = {
  texto: "",
  empresa: "todas",
  estado: "todos",
  soloPorRevisar: false,
  desde: "",
  hasta: "",
};

/** ¿Hay algún filtro puesto? Sirve para ofrecer "limpiar" solo cuando hace falta. */
export function hayFiltros(filtros: FiltrosDeOfertas): boolean {
  return (
    filtros.texto.trim() !== "" ||
    filtros.empresa !== "todas" ||
    filtros.estado !== "todos" ||
    filtros.soloPorRevisar ||
    filtros.desde !== "" ||
    filtros.hasta !== ""
  );
}

/**
 * Las ofertas que pasan los filtros, en el orden en que venían.
 *
 * `autores` es id de usuario → nombre, y llega vacío para quien solo ve las suyas:
 * ahí buscar por autor no distingue nada.
 */
export function filtrarOfertas(
  ofertas: OfertaResumen[],
  filtros: FiltrosDeOfertas,
  autores: Record<string, string> = {},
): OfertaResumen[] {
  const texto = filtros.texto.trim().toLocaleLowerCase("es-CL");

  return ofertas.filter((oferta) => {
    if (filtros.empresa !== "todas" && oferta.empresa !== filtros.empresa) return false;
    if (filtros.estado !== "todos" && oferta.estado !== filtros.estado) return false;
    if (filtros.soloPorRevisar && oferta.cantidadInconsistencias === 0) return false;

    // Se compara por los primeros diez caracteres del ISO, que son "aaaa-mm-dd": el
    // <input type="date"> entrega ese mismo formato y así la comparación es de texto,
    // sin husos horarios en el medio.
    const dia = oferta.actualizadoEn.slice(0, 10);
    if (filtros.desde && dia < filtros.desde) return false;
    if (filtros.hasta && dia > filtros.hasta) return false;

    if (!texto) return true;
    const autor = oferta.creadoPor ? (autores[oferta.creadoPor] ?? "") : "";
    return [oferta.nombre, oferta.numeroOferta, oferta.cliente, oferta.faena, autor].some((campo) =>
      (campo ?? "").toLocaleLowerCase("es-CL").includes(texto),
    );
  });
}
