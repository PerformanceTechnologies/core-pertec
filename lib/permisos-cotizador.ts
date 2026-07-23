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
  | "administrar_parametros_legales";

const ACCIONES_USUARIO: AccionCotizador[] = [
  "crear_cotizacion",
  "editar_cotizacion",
  "eliminar_cotizacion",
  "marcar_emitida",
  "crear_nueva_version",
];

export function puedeEnCotizador(rol: RolCotizador, accion: AccionCotizador): boolean {
  if (rol === "admin") return true;
  if (rol === "usuario") return ACCIONES_USUARIO.includes(accion);
  return false; // visualizador: solo lectura, incluida la administración de parámetros legales
}
