// Aplicaciones en pausa: siguen en el catálogo y con sus permisos, pero nadie las ve ni las abre.
//
// Sin "server-only": lo usan el filtro del menú (servidor) y las pruebas.
//
// Pausar NO es borrar ni retirar (ver APPS_RETIRADAS en lib/aplicaciones.ts, que es para las que
// se sacaron del Core y cuya fila quedó huérfana). Una app en pausa conserva todo: la fila del
// catálogo, quién la tiene asignada, sus datos y su código. Solo se esconde de todos lados mientras
// se decide qué hacer con ella:
//
//   - menú, Inicio y buscador (Ctrl+K): salen de `filtrarAppsDelUsuario` (lib/menu-usuario.ts);
//   - su página y sus rutas de API: las guardas de lib/autorizacion.ts las niegan, incluso al admin;
//   - Administración: SÍ se sigue viendo —con su insignia «En pausa»— y sigue en el formulario de
//     usuarios. Ahí tiene que quedar: guardar un usuario reemplaza todas sus asignaciones por las
//     marcadas, y una app que no se pudiera marcar perdería el acceso de cada persona en silencio.
//
// Reactivarla es borrar su slug de esta lista.
//
// Se reconocen por slug (es lo que usan las guardas) y no por ruta.

/** Los slugs de las aplicaciones en pausa. */
export const SLUGS_PAUSADOS: readonly string[] = [
  // Proyectos (Gantt, objetivos, gastos) y, con él, Mantención de equipos: usan el mismo permiso.
  "proyectos",
];

/** Si la aplicación con ese slug está en pausa. */
export function estaPausada(slug: string): boolean {
  return SLUGS_PAUSADOS.includes(slug);
}
