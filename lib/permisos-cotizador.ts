// Sin "server-only": lo importan tanto rutas de servidor (para decidir si
// una Server Action puede ejecutarse) como componentes cliente (para decidir
// qué botones mostrar). La resolución del rol en sí (resolverRolCotizador,
// que sí consulta la DB) vive en lib/cotizador.ts, que es server-only.
//
// Mismo esquema de 3 niveles que /proyectos (ver lib/permisos-panel.ts):
// rol interno de la app, independiente del rol del core (admin/usuario).

export type RolCotizador = "admin" | "usuario" | "visualizador";

export type AccionCotizador =
  | "crear_cotizacion"
  | "editar_cotizacion"
  | "eliminar_cotizacion"
  | "marcar_emitida"
  | "crear_nueva_version"
  | "administrar_parametros_legales"
  | "administrar_catalogo_cargos"
  // Identidad legal (razón social, RUT, dirección) que se imprime en el ECO-1 y
  // en el PDF que se le manda al mandante: se deja al mismo nivel que los
  // parámetros legales, solo admin, porque un dato mal cargado sale firmado en
  // una oferta.
  | "administrar_empresas";

const ACCIONES_USUARIO: AccionCotizador[] = [
  "crear_cotizacion",
  "editar_cotizacion",
  "eliminar_cotizacion",
  "marcar_emitida",
  "crear_nueva_version",
  "administrar_catalogo_cargos",
];

export function puedeEnCotizador(rol: RolCotizador, accion: AccionCotizador): boolean {
  if (rol === "admin") return true;
  if (rol === "usuario") return ACCIONES_USUARIO.includes(accion);
  return false; // visualizador: solo lectura, incluidos parámetros legales y empresas
}

/**
 * ¿Esta cotización es de esta persona?
 *
 * Una cotización tiene precios, márgenes y dotación de un cliente concreto, y
 * hasta ahora el listado mostraba TODAS a cualquiera con acceso a la app. Ahora
 * cada uno ve las suyas y el admin ve todas, que es la única mirada que necesita
 * ver el portafolio completo.
 *
 * Las de ejemplo (es_demo) son de todos a propósito: son la referencia para
 * entender la herramienta, no el trabajo de nadie.
 *
 * Una cotización sin dueño —`creado_por` en null, que hoy no existe ninguna pero
 * podría aparecer por una carga manual— la ve solo el admin. Es deliberado:
 * mostrársela a todos filtraría datos de un cliente, y esconderla de todos la
 * perdería en silencio. Así queda a la vista de quien puede reasignarla.
 *
 * Vive acá, y no en lib/cotizador.ts, porque la misma regla la necesitan el
 * servidor (para filtrar y para gatear las Server Actions) y la UI.
 */
export function puedeVerCotizacion(
  cotizacion: { creadoPor: string | null; esDemo: boolean },
  usuarioId: string,
  rol: RolCotizador,
): boolean {
  if (rol === "admin") return true;
  if (cotizacion.esDemo) return true;
  return cotizacion.creadoPor !== null && cotizacion.creadoPor === usuarioId;
}
