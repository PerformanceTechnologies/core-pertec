import { cache } from "react";
import { obtenerAplicacionPorSlug } from "@/lib/aplicaciones";
import type { Aplicacion, UsuarioConAcceso } from "./tipos";

/**
 * Los submódulos de un contrato.
 *
 * En core-ih cada uno era una aplicación del catálogo, asignable por separado. En core-pertec hay
 * UNA aplicación, «Contratos», y quien la tiene ve todos los submódulos de cada contrato: el rol
 * por aplicación (Administrador, Usuario Especial, Usuario Normal) decide qué puede hacer adentro.
 *
 * Se mantienen como lista con los mismos slugs de core-ih para que el resto del código —el panel,
 * los guardias, los responsables por módulo— funcione sin cambios. El `id` es el slug: no hay fila
 * en ninguna tabla detrás.
 */
export const SUBMODULOS: readonly Aplicacion[] = [
  submodulo(0, "contratos", "Documentos del contrato", "folder"),
  submodulo(1, "documentos-generales", "Documentos generales", "folder"),
  submodulo(2, "acreditacion", "Acreditación Personas", "id-badge"),
  submodulo(3, "acreditacion-vehiculos", "Acreditación Vehículos", "car"),
  submodulo(4, "logistica", "Logística", "truck"),
  submodulo(5, "gastos-arranque", "Gastos de arranque", "receipt"),
];

function submodulo(orden: number, slug: string, nombre: string, icono: string): Aplicacion {
  return {
    id: slug,
    slug,
    nombre,
    url: "",
    tipo: "interna",
    icono,
    descripcion: null,
    estado: "activa",
    orden,
  };
}

/** La aplicación «Contratos» del catálogo de core-pertec: la que se asigna en Usuarios. */
export const aplicacionDeContratos = cache(() => obtenerAplicacionPorSlug("contratos"));

export const listarAplicaciones = cache(async function listarAplicaciones(): Promise<Aplicacion[]> {
  return [...SUBMODULOS];
});

export async function obtenerAplicacionPorSlug_(slug: string): Promise<Aplicacion | null> {
  return SUBMODULOS.find((a) => a.slug === slug) ?? null;
}

/** Los submódulos que ve: todos o ninguno, según tenga la app Contratos (ver usuarios.ts). */
export function aplicacionesVisibles(usuario: UsuarioConAcceso, todas: Aplicacion[]): Aplicacion[] {
  const propias = new Set(usuario.aplicacionIds);
  return todas.filter((app) => usuario.rol === "admin" || propias.has(app.id));
}
