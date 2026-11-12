// Sin "server-only": lo importan tanto rutas de servidor (para decidir si una
// acción puede ejecutarse) como componentes cliente (para decidir qué mostrar).
// La resolución del rol en sí —resolverRolRendidor, que consulta la DB— vive en
// lib/rendidor/permisos.ts, que sí es server-only.
//
// Mismo esquema que /proyectos, /cotizador y /contratos: un rol interno de la
// app, guardado en usuario_aplicaciones.rol_extra, independiente del rol del
// core (admin/usuario).

import type { EstadoRendicion, GastoRendicion } from "./rendidor/tipos";

/**
 * Los dos roles de Rendir Gastos.
 *
 * Solo dos, y no tres como el Cotizador, porque acá la única pregunta es DE
 * QUIÉN son las rendiciones que puedes ver. Todo lo demás —crear, cargar a
 * Odoo, exportar— lo hace cualquiera con la app asignada, sobre lo suyo.
 *
 * El valor guardado es "admin", el MISMO que usan Proyectos, Cotizador y
 * Contratos. La primera versión guardaba "administrador" y el guardado se caía:
 * usuario_aplicaciones.rol_extra es una columna compartida por todos los
 * módulos, y un valor que ninguno había usado antes no pasa. Lo que se lee en
 * pantalla sigue siendo "Administrador de gastos" — la etiqueta es de este
 * módulo, el valor es del esquema.
 */
export type RolRendidor = "usuario" | "admin";

/** Para la pantalla de Usuarios. El texto es el que se lee en el selector. */
export const ROLES_RENDIDOR: { valor: RolRendidor; etiqueta: string }[] = [
  { valor: "usuario", etiqueta: "Rendir Gastos: Usuario" },
  { valor: "admin", etiqueta: "Rendir Gastos: Administrador de gastos" },
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
  return rolDelCore === "admin" || rolDelModulo === "admin";
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
  /** Quien rinde también la abre, aunque la haya creado otra persona (un admin a su nombre). */
  rindeCorreo?: string | null,
  correo?: string,
): boolean {
  if (creadoPor !== null && creadoPor === usuarioId) return true;
  if (rindeCorreo && correo && rindeCorreo.toLowerCase() === correo.toLowerCase()) return true;
  return puedeVerRendicionesAjenas(rolDelCore, rolDelModulo);
}

// ---------------------------------------------------------------------------
//  El ciclo de una rendición, ya sin Odoo.
// ---------------------------------------------------------------------------


export const ETIQUETA_ESTADO_RENDICION: Record<EstadoRendicion, string> = {
  borrador: "Borrador",
  enviada: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Observada",
  pagada: "Pagada",
  cargada_odoo: "Histórica",
  reembolso_pendiente: "Reembolso pendiente",
  reembolsada: "Reembolsada",
  cerrada: "Cerrada",
  anulada: "Anulada",
};

/** Los pasos que se dibujan en la cabecera; rechazada vuelve al primero. */
export const PASOS_RENDICION: { estado: EstadoRendicion; etiqueta: string }[] = [
  { estado: "borrador", etiqueta: "Borrador" },
  { estado: "enviada", etiqueta: "En revisión" },
  { estado: "aprobada", etiqueta: "Aprobada" },
  { estado: "pagada", etiqueta: "Pagada" },
];

/** Los gastos solo se tocan mientras la rendición está en manos de quien rinde. */
export function esEditable(estado: EstadoRendicion): boolean {
  return estado === "borrador" || estado === "rechazada";
}

/**
 * Lo que falta para poder enviar a revisión. Vacío = se puede enviar.
 *
 * Un dato ilegible sin confirmar o un gasto en $0 llegarían al revisor como si fueran
 * ciertos; se piden antes, no después.
 */
export function problemasParaEnviar(gastos: Pick<GastoRendicion, "total" | "pendientes" | "proveedor">[]): string[] {
  const problemas: string[] = [];
  if (gastos.length === 0) problemas.push("Agrega al menos un gasto (con comprobante o manual).");
  const pendientes = gastos.filter((g) => g.pendientes.length > 0).length;
  if (pendientes > 0) problemas.push(`${pendientes} ${pendientes === 1 ? "gasto tiene" : "gastos tienen"} datos por confirmar.`);
  const sinMonto = gastos.filter((g) => !(g.total > 0)).length;
  if (sinMonto > 0) problemas.push(`${sinMonto} ${sinMonto === 1 ? "gasto no tiene" : "gastos no tienen"} total.`);
  const sinProveedor = gastos.filter((g) => !g.proveedor?.trim()).length;
  if (sinProveedor > 0) problemas.push(`${sinProveedor} ${sinProveedor === 1 ? "gasto no tiene" : "gastos no tienen"} proveedor.`);
  return problemas;
}

export type AccionRendicion = "enviar" | "retirar" | "aprobar" | "rechazar" | "pagar" | "reabrir";

/**
 * Qué puede hacer esta persona con esta rendición ahora.
 *
 * - Quien rinde (o la creó) envía, y retira mientras nadie la revisó.
 * - Quien revisa aprueba, rechaza y marca pagada. No aprueba la suya propia, salvo el
 *   admin del Core: si no, un administrador de gastos se autoaprobaría sus gastos.
 * - Una aprobada se puede reabrir (vuelve a revisión) si se aprobó por error, antes de pagar.
 */
export function accionesPosibles(
  r: { estado: EstadoRendicion; esMia: boolean },
  revisa: boolean,
  esAdminCore: boolean,
): AccionRendicion[] {
  const a: AccionRendicion[] = [];
  const puedeRevisar = revisa && (!r.esMia || esAdminCore);
  if (r.esMia && esEditable(r.estado)) a.push("enviar");
  if (r.esMia && r.estado === "enviada") a.push("retirar");
  if (puedeRevisar && r.estado === "enviada") a.push("aprobar", "rechazar");
  if (revisa && r.estado === "aprobada") a.push("pagar", "reabrir");
  return a;
}

/** Lo que queda a favor o en contra: positivo, la empresa le debe a quien rinde. */
export function saldoRendicion(totalRendido: number, montoAsignado: number): number {
  return totalRendido - montoAsignado;
}
