// Sin "server-only": lo importan tanto rutas de servidor (para decidir si una
// acción puede ejecutarse) como componentes cliente (para decidir qué mostrar).
// La resolución del rol en sí —resolverRolRendidor, que consulta la DB— vive en
// lib/rendidor/permisos.ts, que sí es server-only.
//
// Mismo esquema que /proyectos, /cotizador y /contratos: un rol interno de la
// app, guardado en usuario_aplicaciones.rol_extra, independiente del rol del
// core (admin/usuario).

/**
 * Los dos roles de Rendir Gastos.
 *
 * Solo dos, y no tres como el Cotizador, porque acá la única pregunta es DE
 * QUIÉN son las rendiciones que puedes ver. Todo lo demás —crear, cargar a
 * Odoo, exportar— lo hace cualquiera con la app asignada, sobre lo suyo.
 */
export type RolRendidor = "usuario" | "administrador";

/** Para la pantalla de Usuarios. El texto es el que se lee en el selector. */
export const ROLES_RENDIDOR: { valor: RolRendidor; etiqueta: string }[] = [
  { valor: "usuario", etiqueta: "Rendir Gastos: Usuario" },
  { valor: "administrador", etiqueta: "Rendir Gastos: Administrador de gastos" },
];

/**
 * Si puede ver y tocar rendiciones que no son suyas.
 *
 * Es LA pregunta de este módulo, y por eso es una función y no una comparación
 * suelta repetida en cada archivo. Antes había ocho `rol !== "admin"` idénticos
 * desparramados —en rutas, en acciones y en páginas— y agregar un rol nuevo
 * significaba acordarse de los ocho. El que se olvida no falla ruidosamente:
 * deja a alguien viendo de menos, o de más.
 */
export function puedeVerRendicionesAjenas(
  rolDelCore: string,
  rolDelModulo: RolRendidor,
): boolean {
  // El admin del core entra a todo, como en el resto del sistema.
  return rolDelCore === "admin" || rolDelModulo === "administrador";
}

/**
 * Si esta persona puede abrir ESTA rendición.
 *
 * La propia siempre; una ajena solo con el rol. `creadoPor` puede venir en null
 * —rendiciones viejas, de antes de que se guardara el autor— y en ese caso NO
 * es de nadie: solo la ve quien puede ver las ajenas. Tratarlas como propias
 * habría sido lo cómodo y se las habría mostrado a todo el mundo.
 */
export function puedeAbrirRendicion(
  creadoPor: string | null,
  usuarioId: string,
  rolDelCore: string,
  rolDelModulo: RolRendidor,
): boolean {
  if (creadoPor !== null && creadoPor === usuarioId) return true;
  return puedeVerRendicionesAjenas(rolDelCore, rolDelModulo);
}
