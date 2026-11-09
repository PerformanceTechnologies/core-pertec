// Sin "server-only": lo importan tanto el servidor (para decidir si una Server Action puede
// ejecutarse) como los componentes cliente (para decidir qué botones mostrar). La resolución del
// rol contra la base —que sí consulta— vive en lib/inventario-archivado.ts, que es server-only.
//
// Mismo esquema que Rendir Gastos, Proyectos y el Cotizador: un rol interno de la app, guardado en
// usuario_aplicaciones.rol_extra, independiente del rol del Core (admin/usuario).

/**
 * Los dos roles de Inventario.
 *
 * Solo dos: abrir el módulo, crear productos, mover stock y ajustar lo hace cualquiera con la app
 * asignada. Lo único que se reserva es lo que no se puede deshacer a ojo —sacar un producto del
 * catálogo—, que es ARCHIVAR (y restaurar).
 *
 * El valor guardado es "admin", el MISMO que usan Proyectos, Cotizador, Contratos y Rendir Gastos:
 * usuario_aplicaciones.rol_extra es una columna compartida por todos los módulos y un valor que
 * ninguno había usado antes puede no pasar. La etiqueta que se lee en pantalla es de este módulo.
 */
export type RolInventario = "usuario" | "admin";

/** Para la pantalla de Usuarios. El texto es el que se lee en el selector. */
export const ROLES_INVENTARIO: { valor: RolInventario; etiqueta: string }[] = [
  { valor: "usuario", etiqueta: "Inventario: Usuario" },
  { valor: "admin", etiqueta: "Inventario: Administrador de inventario" },
];

/**
 * Si esta persona puede archivar y restaurar productos.
 *
 * Es LA pregunta de esta función, y por eso vive en un solo lugar: la usan la Server Action (que es
 * la que de verdad protege) y las pantallas (que solo deciden si dibujar el botón). El administrador
 * del Core puede siempre, como en el resto del sistema; el resto, solo con el rol «Administrador de
 * inventario» que el admin le haya asignado.
 */
export function puedeArchivarProductos(rolDelCore: string, rolDelModulo: RolInventario): boolean {
  return rolDelCore === "admin" || rolDelModulo === "admin";
}
