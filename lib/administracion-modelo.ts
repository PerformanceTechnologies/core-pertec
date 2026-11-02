// Las reglas de las pantallas de Administración (Usuarios y Aplicaciones): leer los filtros de la
// dirección, aplicarlos y armar los enlaces que los cambian.
//
// Sin "server-only": las usan las páginas (servidor) y las pruebas. Los filtros viajan en la
// dirección (?q=…&estado=…) y no en un estado del navegador a propósito: así un filtro se puede
// compartir, el botón «atrás» lo respeta y la página sigue siendo de servidor, sin JavaScript.

import type { Aplicacion, EstadoApp, UsuarioConAcceso } from "./tipos";
import { estaPausada } from "./apps-pausadas";

type Parametros = Record<string, string | string[] | undefined>;

/** Un parámetro como texto: si viene repetido (?q=a&q=b) vale el primero. */
function texto(params: Parametros, clave: string): string {
  const valor = params[clave];
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

/** Para comparar sin que importen las mayúsculas ni las tildes: «Ñuñoa» encuentra «nunoa». */
export function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Las iniciales de una persona: «María Paz Soto» → «MS»; sin nombre, del correo: «ana.diaz@…» → «AD». */
export function iniciales(nombre: string | null, correo: string): string {
  const base = nombre?.trim() || correo.split("@")[0].replace(/[._-]+/g, " ");
  const partes = base.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primera = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primera + ultima).toUpperCase();
}

/**
 * Un enlace a `base` con los parámetros de `actuales` cambiados por `cambios`. Un parámetro con
 * valor vacío o `undefined` se quita (volver a «todos» no deja ?estado=todos en la dirección).
 */
export function hrefConFiltros(base: string, actuales: Record<string, string>, cambios: Record<string, string | undefined>): string {
  const finales: Record<string, string> = { ...actuales };
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor) finales[clave] = valor;
    else delete finales[clave];
  }
  const consulta = new URLSearchParams(finales).toString();
  return consulta ? `${base}?${consulta}` : base;
}

// ─── Usuarios ────────────────────────────────────────────────────────────────

export type FiltroEstadoUsuario = "todos" | "activos" | "inactivos";
export type FiltroRolUsuario = "todos" | "admin" | "usuario";

export interface FiltrosDeUsuarios {
  /** Texto libre: nombre o correo. */
  q: string;
  estado: FiltroEstadoUsuario;
  rol: FiltroRolUsuario;
  /** Solo los usuarios activos, no administradores, sin ninguna aplicación (entran y no ven nada). */
  sinApps: boolean;
}

export function leerFiltrosDeUsuarios(params: Parametros): FiltrosDeUsuarios {
  const estado = texto(params, "estado");
  const rol = texto(params, "rol");
  return {
    q: texto(params, "q"),
    estado: estado === "activos" || estado === "inactivos" ? estado : "todos",
    rol: rol === "admin" || rol === "usuario" ? rol : "todos",
    sinApps: texto(params, "acceso") === "sin-apps",
  };
}

/** Los filtros como parámetros de dirección, sin los que están en su valor de por omisión. */
export function parametrosDeUsuarios(f: FiltrosDeUsuarios): Record<string, string> {
  const params: Record<string, string> = {};
  if (f.q) params.q = f.q;
  if (f.estado !== "todos") params.estado = f.estado;
  if (f.rol !== "todos") params.rol = f.rol;
  if (f.sinApps) params.acceso = "sin-apps";
  return params;
}

export function hayFiltrosDeUsuarios(f: FiltrosDeUsuarios): boolean {
  return Object.keys(parametrosDeUsuarios(f)).length > 0;
}

/** Cuántas aplicaciones del catálogo tiene asignadas (las que ya no existen no cuentan). */
export function appsAsignadasVigentes(usuario: UsuarioConAcceso, idsDelCatalogo: ReadonlySet<string>): number {
  return usuario.aplicacionIds.filter((id) => idsDelCatalogo.has(id)).length;
}

export function filtrarUsuarios(
  usuarios: UsuarioConAcceso[],
  f: FiltrosDeUsuarios,
  idsDelCatalogo: ReadonlySet<string>,
): UsuarioConAcceso[] {
  const buscado = normalizar(f.q);
  return usuarios.filter((u) => {
    if (f.estado === "activos" && !u.activo) return false;
    if (f.estado === "inactivos" && u.activo) return false;
    if (f.rol !== "todos" && u.rol !== f.rol) return false;
    if (f.sinApps && !(u.activo && u.rol !== "admin" && appsAsignadasVigentes(u, idsDelCatalogo) === 0)) return false;
    if (buscado && !normalizar(`${u.nombre ?? ""} ${u.correo}`).includes(buscado)) return false;
    return true;
  });
}

// ─── Aplicaciones ────────────────────────────────────────────────────────────

/** `en-pausa` no es un estado de la tabla: es lo que dice lib/apps-pausadas.ts. */
export type FiltroEstadoApp = EstadoApp | "todas" | "en-pausa";

export interface FiltrosDeApps {
  q: string;
  estado: FiltroEstadoApp;
}

const ESTADOS_VALIDOS: FiltroEstadoApp[] = ["activa", "en_desarrollo", "mantenimiento", "en-pausa"];

export function leerFiltrosDeApps(params: Parametros): FiltrosDeApps {
  const estado = texto(params, "estado") as FiltroEstadoApp;
  return { q: texto(params, "q"), estado: ESTADOS_VALIDOS.includes(estado) ? estado : "todas" };
}

export function parametrosDeApps(f: FiltrosDeApps): Record<string, string> {
  const params: Record<string, string> = {};
  if (f.q) params.q = f.q;
  if (f.estado !== "todas") params.estado = f.estado;
  return params;
}

export function hayFiltrosDeApps(f: FiltrosDeApps): boolean {
  return Object.keys(parametrosDeApps(f)).length > 0;
}

export function filtrarApps(apps: Aplicacion[], f: FiltrosDeApps): Aplicacion[] {
  const buscado = normalizar(f.q);
  return apps.filter((a) => {
    if (f.estado === "en-pausa" ? !estaPausada(a.slug) : f.estado !== "todas" && a.estado !== f.estado) return false;
    if (buscado && !normalizar(`${a.nombre} ${a.descripcion ?? ""} ${a.url}`).includes(buscado)) return false;
    return true;
  });
}

/** Cuántas aplicaciones hay en cada estado (y cuántas en pausa), para las cifras de arriba. */
export function contarAppsPorEstado(apps: Aplicacion[]): Record<"total" | EstadoApp | "en-pausa", number> {
  return {
    total: apps.length,
    activa: apps.filter((a) => a.estado === "activa").length,
    en_desarrollo: apps.filter((a) => a.estado === "en_desarrollo").length,
    mantenimiento: apps.filter((a) => a.estado === "mantenimiento").length,
    "en-pausa": apps.filter((a) => estaPausada(a.slug)).length,
  };
}
