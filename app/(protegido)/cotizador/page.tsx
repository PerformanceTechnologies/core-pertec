import { exigirAccesoCotizador, listarCotizaciones } from "@/lib/cotizador";
import { listarUsuarios } from "@/lib/usuarios";
import PanelCotizador from "@/components/cotizador/PanelCotizador";

/**
 * El listado muestra las cotizaciones de quien mira; el admin ve todas.
 *
 * `listarCotizaciones` recibe el guard completo justamente para que el filtro no
 * se pueda omitir acá por descuido — ver su comentario en lib/cotizador.ts.
 */
export default async function CotizadorPage() {
  const quien = await exigirAccesoCotizador();
  const cotizaciones = await listarCotizaciones(quien);

  // Los nombres se piden solo para el admin: es el único listado con
  // cotizaciones de varias personas, y por lo tanto el único donde saber de
  // quién es cada una agrega algo.
  const autores: Record<string, string> = {};
  if (quien.rol === "admin") {
    for (const u of await listarUsuarios()) autores[u.id] = u.nombre ?? u.correo;
  }

  return <PanelCotizador cotizaciones={cotizaciones} rol={quien.rol} autores={autores} />;
}
