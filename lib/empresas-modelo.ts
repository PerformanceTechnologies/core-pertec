// Multiempresa: el vocabulario y las reglas de quién ve qué empresa.
//
// Sin "server-only": lo importan el selector del menú (cliente) y el resolutor
// del servidor. Acá no se toca la base — eso es lib/empresas.ts.
//
// ── La regla que importa ────────────────────────────────────────────────────
//
// Cuál empresa está activa viaja en una COOKIE, porque el servidor tiene que
// saberlo para armar cada página. Y una cookie la escribe el navegador: quien
// quiera puede poner ahí el slug de una empresa que no le corresponde. Por eso
// resolverEmpresaActiva NUNCA devuelve lo que dice la cookie: devuelve una de
// las empresas PERMITIDAS, usando la cookie apenas como preferencia. Si el slug
// no está en la lista, cae a la de por omisión en silencio.
//
// Es la misma idea que en Rendir Gastos: la decisión vive en un solo lugar, para
// que agregar una empresa no signifique acordarse de siete comparaciones.

export interface Empresa {
  id: string;
  nombre: string;
  slug: string;
  rut: string | null;
  color: string;
  logo: string | null;
  orden: number;
  activa: boolean;
}

/** El nombre de la cookie que lleva el slug de la empresa activa. */
export const COOKIE_EMPRESA = "core-empresa";

/**
 * La empresa de por omisión: la dueña de todo lo que hay cargado hoy.
 *
 * Quien no tiene ninguna asignada ve esta, y no un Core vacío ni un error. El
 * Core funcionó años con una sola empresa y la enorme mayoría de la gente sigue
 * trabajando solo en ella: pedirle que elija algo sería ruido.
 */
export const SLUG_POR_OMISION = "pertec";

/**
 * Las empresas en las que esta persona se puede parar.
 *
 * El admin del core entra a todas, como en el resto del sistema. Para el resto
 * son las asignadas — y si no tiene ninguna, la de por omisión, nunca todas.
 */
export function empresasPermitidas(
  todas: Empresa[],
  idsAsignadas: string[],
  rolDelCore: string,
): Empresa[] {
  const activas = todas.filter((e) => e.activa);
  if (rolDelCore === "admin") return activas;

  const suyas = activas.filter((e) => idsAsignadas.includes(e.id));
  if (suyas.length > 0) return suyas;

  // Sin asignaciones: la de por omisión. Devolver `activas` acá habría sido el
  // atajo cómodo y le habría dado las tres empresas a todo usuario nuevo.
  const porOmision = activas.find((e) => e.slug === SLUG_POR_OMISION);
  return porOmision ? [porOmision] : [];
}

/**
 * En qué empresa está parada esta persona ahora.
 *
 * `slugDeCookie` es una preferencia que viene del navegador y no se cree: solo
 * se usa si apunta a una de las permitidas. Si no, se cae a la de por omisión, y
 * si tampoco está permitida, a la primera de la lista.
 */
export function resolverEmpresaActiva(
  slugDeCookie: string | null | undefined,
  permitidas: Empresa[],
): Empresa | null {
  if (permitidas.length === 0) return null;

  const pedida = slugDeCookie ? permitidas.find((e) => e.slug === slugDeCookie) : undefined;
  if (pedida) return pedida;

  return permitidas.find((e) => e.slug === SLUG_POR_OMISION) ?? permitidas[0];
}

/** Si esta persona puede pararse en esta empresa. Lo que valida el cambio. */
export function puedeVerEmpresa(slug: string, permitidas: Empresa[]): boolean {
  return permitidas.some((e) => e.slug === slug);
}

/**
 * Si el selector se muestra.
 *
 * Con una sola empresa no hay nada que elegir y un combo de un ítem es ruido en
 * un menú que ya tiene bastante. Hugo lo pidió "sutil": lo más sutil que puede
 * ser es no estar cuando no sirve.
 */
export function mostrarSelector(permitidas: Empresa[]): boolean {
  return permitidas.length > 1;
}

/** Las iniciales para el chip del menú: "Performance Service" → "PS". */
export function inicialesDe(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}
