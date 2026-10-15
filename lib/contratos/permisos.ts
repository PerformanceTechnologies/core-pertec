// Qué puede hacer cada rol. Puro y sin base: lo importan componentes cliente (para esconder lo que
// no se puede hacer) y el servidor (para negarlo), y tiene que decir lo mismo en los dos lados.
//
//   Administrador    todo, en todos los módulos, incluidos los usuarios.
//   Usuario Especial dentro de los módulos que tiene asignados: crear, editar, eliminar y
//                    configurar (ítems, cargos, catálogos, fechas límite…). No toca usuarios.
//   Usuario Normal   dentro de sus módulos: agregar datos y subir archivos. Nada más.
//
// El rol dice QUÉ se puede hacer; los módulos asignados dicen DÓNDE. Son dos preguntas distintas y
// se comprueban por separado (ver exigirCapacidad en autorizacion.ts).

import type { Rol } from "./tipos";

export type Capacidad =
  /** Agregar datos nuevos (una persona, un gasto, una cotización) y subir archivos. */
  | "crear"
  /** Cambiar o eliminar lo que ya existe: datos, estados, archivos, validaciones. */
  | "editar"
  /** Las reglas del módulo: ítems, cargos, catálogos, dotación, fechas límite, responsables. */
  | "configurar"
  /** Crear, editar y eliminar usuarios del core, y sus accesos. */
  | "usuarios";

const CAPACIDADES: Record<Rol, readonly Capacidad[]> = {
  admin: ["crear", "editar", "configurar", "usuarios"],
  especial: ["crear", "editar", "configurar"],
  usuario: ["crear"],
};

export function esRol(valor: unknown): valor is Rol {
  return valor === "admin" || valor === "especial" || valor === "usuario";
}

export function puede(rol: Rol, capacidad: Capacidad): boolean {
  return CAPACIDADES[rol]?.includes(capacidad) ?? false;
}

export const ETIQUETAS_DE_ROL: Record<Rol, string> = {
  admin: "Administrador",
  especial: "Usuario Especial",
  usuario: "Usuario Normal",
};

export const DESCRIPCION_DE_ROL: Record<Rol, string> = {
  admin: "Ve y edita todo, incluidos los usuarios y todas las configuraciones.",
  especial:
    "En sus módulos: crea y edita datos y cambia las configuraciones (ítems, cargos, catálogos, fechas límite). No elimina fichas de personas ni vehículos ni administra usuarios.",
  usuario: "En sus módulos: agrega datos y sube archivos. No edita ni elimina lo existente.",
};

/** El texto cuando se intenta algo que el rol no permite. */
export const MENSAJE_SIN_PERMISO = "Tu rol no permite hacer esto. Pídele a un administrador que lo haga o que te cambie el rol.";

/** Un permiso denegado: se distingue de un error cualquiera para no confundirlo en los registros. */
export class SinPermiso extends Error {
  constructor(mensaje: string = MENSAJE_SIN_PERMISO) {
    super(mensaje);
    this.name = "SinPermiso";
  }
}
