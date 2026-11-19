import "server-only";
import { auth } from "@/auth";
import { obtenerAplicacionPorSlug } from "@/lib/aplicaciones";
import { exigirAccesoApp, verificarAccesoAppApi } from "@/lib/autorizacion";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import type { UsuarioConAcceso } from "@/lib/tipos";
import {
  armarDocumentos,
  esCarpetaDeSociedades,
  esRolRepositorio,
  puedeEnRepositorio,
  puedeVerDocumento,
  sociedadesDe,
  SLUG_REPOSITORIO_LEGAL,
  type AccionRepositorio,
  type Documento,
  type RolRepositorio,
  type SociedadBase,
} from "./modelo";
import { leerArbol } from "./sharepoint";

// -----------------------------------------------------------------------------
//  Lo que leen las pantallas: el árbol de SharePoint convertido en sociedades y documentos, ya
//  filtrado por lo que la persona puede ver. Y quién puede hacer qué (solo servidor).
// -----------------------------------------------------------------------------

export interface Permisos {
  rol: RolRepositorio;
  rolCore: string;
  subir: boolean;
  editar: boolean;
  confidencial: boolean;
}

/** El rol de la persona en el módulo. Por omisión «usuario»: ve y sube, no edita ni borra. */
export async function resolverRol(usuario: UsuarioConAcceso): Promise<RolRepositorio> {
  if (usuario.rol === "admin") return "admin";
  const app = await obtenerAplicacionPorSlug(SLUG_REPOSITORIO_LEGAL);
  const guardado = app ? usuario.rolesExtra[app.id] : null;
  return esRolRepositorio(guardado) ? guardado : "usuario";
}

export async function permisosDe(usuario: UsuarioConAcceso): Promise<Permisos> {
  const rol = await resolverRol(usuario);
  return {
    rol,
    rolCore: usuario.rol,
    subir: puedeEnRepositorio(usuario.rol, rol, "subir"),
    editar: puedeEnRepositorio(usuario.rol, rol, "editar"),
    confidencial: puedeEnRepositorio(usuario.rol, rol, "confidencial"),
  };
}

/** Para páginas: acceso a la app (redirige si no) y sus permisos. */
export async function exigirRepositorio(): Promise<{ usuario: UsuarioConAcceso; permisos: Permisos }> {
  const usuario = await exigirAccesoApp(SLUG_REPOSITORIO_LEGAL);
  return { usuario, permisos: await permisosDe(usuario) };
}

/** Para Server Actions y route handlers: acceso + una acción concreta. Lanza si no se puede. */
export async function exigirAccion(accion: AccionRepositorio): Promise<{ usuario: UsuarioConAcceso; permisos: Permisos }> {
  const acceso = await verificarAccesoAppApi(SLUG_REPOSITORIO_LEGAL);
  if (!acceso.usuario) throw new SinPermisoLegal(acceso.status === 401 ? "Inicia sesión de nuevo." : "No tienes acceso al Repositorio Legal.");
  const permisos = await permisosDe(acceso.usuario);
  if (!puedeEnRepositorio(acceso.usuario.rol, permisos.rol, accion)) {
    throw new SinPermisoLegal("Tu rol en el Repositorio Legal no permite hacer esto. Pídele a un administrador que lo haga o que te cambie el rol.");
  }
  return { usuario: acceso.usuario, permisos };
}

export class SinPermisoLegal extends Error {
  constructor(m: string) {
    super(m);
    this.name = "SinPermisoLegal";
  }
}

export interface Repositorio {
  sociedades: SociedadBase[];
  documentos: Documento[];
  /** Carpetas existentes (para mover y para elegir dónde subir). */
  carpetas: string[];
  /** Los paquetes de solicitudes (carpetas de segundo nivel de SOLICITUDES/PEDIDOS). */
  paquetes: { nombre: string; carpeta: string; documentos: number; ultimo: string | null }[];
}

/** Todo el repositorio, sin filtrar por persona (para el cron, con la app del Core). */
export async function cargarRepositorioCompleto(opciones: { soloApp?: boolean; fresco?: boolean } = {}): Promise<Repositorio> {
  const arbol = await leerArbol(opciones);
  const carpetasDeSociedades = arbol.carpetas.filter((c) => {
    const p = c.split("/");
    return p.length === 2 && esCarpetaDeSociedades(p[0]);
  });
  const sociedades = sociedadesDe(carpetasDeSociedades.map((c) => c.split("/")[1]));
  // Lo que no dice de qué sociedad es (las solicitudes armadas para PERTEC, por ejemplo) va a la
  // sociedad por omisión, si está configurada. El slug va en una variable y no en el código: el repo es público.
  const porOmision = (process.env.REPOSITORIO_LEGAL_SOCIEDAD_POR_OMISION || "").trim() || null;
  const documentos = armarDocumentos(arbol.archivos, sociedades, new Date(), porOmision);

  const paquetesMap = new Map<string, { nombre: string; carpeta: string; documentos: number; ultimo: string | null }>();
  for (const d of documentos) {
    if (d.area !== "solicitudes" || !d.paquete) continue;
    const carpeta = d.ruta.split("/").slice(0, 2).join("/");
    const p = paquetesMap.get(carpeta) ?? { nombre: d.paquete, carpeta, documentos: 0, ultimo: null };
    p.documentos += 1;
    if (!p.ultimo || d.modificado > p.ultimo) p.ultimo = d.modificado;
    paquetesMap.set(carpeta, p);
  }

  return { sociedades, documentos, carpetas: arbol.carpetas, paquetes: [...paquetesMap.values()].sort((a, b) => a.carpeta.localeCompare(b.carpeta, "es")) };
}

/** El repositorio tal como lo ve esta persona (sin lo confidencial o restringido que no le toca). */
export async function cargarRepositorio(permisos: Permisos): Promise<Repositorio> {
  const r = await cargarRepositorioCompleto();
  return { ...r, documentos: r.documentos.filter((d) => puedeVerDocumento(d, permisos.rolCore, permisos.rol)) };
}

/** Si la persona de la sesión puede ver ESTE documento (para descargas y vistas previas). */
export async function exigirVerDocumento(id: string): Promise<Documento | null> {
  const { usuario, permisos } = await exigirAccion("ver");
  const r = await cargarRepositorioCompleto();
  const d = r.documentos.find((x) => x.id === id) ?? null;
  // Si no está en el árbol cacheado (recién subido), lo valida sharepoint.ts por la ruta.
  if (d && !puedeVerDocumento(d, usuario.rol, permisos.rol)) throw new SinPermisoLegal("Ese documento es confidencial.");
  return d;
}

export async function usuarioDeSesion(): Promise<UsuarioConAcceso | null> {
  const correo = (await auth())?.user?.email;
  return correo ? obtenerUsuarioActivo(correo) : null;
}
