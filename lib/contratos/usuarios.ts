import "server-only";
import { cache } from "react";
import {
  listarUsuarios as listarDePertec,
  obtenerUsuarioActivo as obtenerDePertec,
} from "@/lib/usuarios";
import type { UsuarioConAcceso as UsuarioDePertec } from "@/lib/tipos";
import { aplicacionDeContratos, SUBMODULOS } from "./aplicaciones";
import type { Rol, UsuarioConAcceso } from "./tipos";

/**
 * Los usuarios de core-pertec, vistos como los espera Contratos.
 *
 * El rol dentro de Contratos sale de dos lugares:
 *  · admin del core → Administrador, siempre;
 *  · si no, el rol por aplicación que se elige en Usuarios para la app Contratos
 *    (Administrador, Usuario Especial o Usuario Normal). Sin elegir, Usuario Normal: el que
 *    menos puede, que es lo que corresponde ante la duda.
 */
function rolEnContratos(usuario: UsuarioDePertec, appId: string | null): Rol {
  if (usuario.rol === "admin") return "admin";
  const elegido = appId ? usuario.rolesExtra[appId] : undefined;
  return elegido === "admin" || elegido === "especial" ? elegido : "usuario";
}

function adaptar(usuario: UsuarioDePertec, appId: string | null): UsuarioConAcceso {
  const tieneContratos = usuario.rol === "admin" || (appId !== null && usuario.aplicacionIds.includes(appId));
  return {
    id: usuario.id,
    correo: usuario.correo,
    nombre: usuario.nombre,
    rol: rolEnContratos(usuario, appId),
    activo: usuario.activo,
    creado_en: usuario.creado_en,
    ultimo_ingreso: usuario.ultimo_ingreso,
    ingreso_anterior: null,
    aplicacionIds: tieneContratos ? SUBMODULOS.map((s) => s.id) : [],
    rolesExtra: usuario.rolesExtra,
  };
}

export const obtenerUsuarioActivo = cache(async function obtenerUsuarioActivo(
  correo: string | null | undefined,
): Promise<UsuarioConAcceso | null> {
  const [usuario, app] = await Promise.all([obtenerDePertec(correo), aplicacionDeContratos()]);
  return usuario ? adaptar(usuario, app?.id ?? null) : null;
});

export async function listarUsuarios(): Promise<UsuarioConAcceso[]> {
  const [usuarios, app] = await Promise.all([listarDePertec(), aplicacionDeContratos()]);
  return usuarios.map((u) => adaptar(u, app?.id ?? null));
}

export interface PersonaAsignable {
  id: string;
  nombre: string;
  correo: string;
}

/**
 * A quién se le puede asignar algo (un requisito, una partida): los usuarios activos que tienen
 * Contratos. Asignarle algo a quien no puede entrar a verlo es dejarlo sin dueño sin que se note.
 */
export async function listarPersonasAsignables(): Promise<PersonaAsignable[]> {
  const usuarios = await listarUsuarios();
  return usuarios
    .filter((u) => u.activo && u.aplicacionIds.length > 0)
    .map((u) => ({ id: u.id, nombre: u.nombre?.trim() || u.correo, correo: u.correo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
