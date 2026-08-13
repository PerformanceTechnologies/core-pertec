import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "../supabase-admin";
import type { EmpresaIdentidad } from "./empresas";

// Identidad legal de las empresas emisoras (tabla cotizador_empresas). Antes
// estaba hardcodeada en el encabezado de EcoTab.tsx con datos de relleno, e
// igual para las 3 empresas: una cotizacion de PERFORMANCE TECHNOLOGIES salia
// con encabezado de ZEUS MINING. Ahora cada cotizacion muestra la suya.
//
// No se borra ninguna empresa: se desactiva (activo = false). El nombre es la
// clave que guarda cotizaciones.empresa, asi que renombrarlo desligaria las
// cotizaciones ya emitidas de su identidad -- por eso actualizarEmpresa no
// toca esa columna.

interface FilaEmpresa {
  id: string;
  nombre: string;
  razon_social: string;
  rut: string;
  direccion: string;
  ciudad: string;
  email: string;
  telefono: string;
  representante_legal: string;
  activo: boolean;
}

const COLUMNAS = `
  id, nombre, razon_social, rut, direccion, ciudad, email, telefono,
  representante_legal, activo
`;

function filaAEmpresa(fila: FilaEmpresa): EmpresaIdentidad {
  return {
    id: fila.id,
    nombre: fila.nombre,
    razonSocial: fila.razon_social ?? "",
    rut: fila.rut ?? "",
    direccion: fila.direccion ?? "",
    ciudad: fila.ciudad ?? "",
    email: fila.email ?? "",
    telefono: fila.telefono ?? "",
    representanteLegal: fila.representante_legal ?? "",
    activo: fila.activo,
  };
}

export async function listarEmpresas(): Promise<EmpresaIdentidad[]> {
  const { data } = await supabaseAdmin
    .from("cotizador_empresas")
    .select(COLUMNAS)
    .order("nombre", { ascending: true });

  return ((data ?? []) as unknown as FilaEmpresa[]).map(filaAEmpresa);
}

// La consultan la pagina del editor y la ruta del PDF; cache() evita repetirla
// cuando ambas corren en el mismo render. Solo deduplica dentro de un request.
export const obtenerEmpresaPorNombre = cache(async function obtenerEmpresaPorNombre(
  nombre: string
): Promise<EmpresaIdentidad | null> {
  const { data } = await supabaseAdmin
    .from("cotizador_empresas")
    .select(COLUMNAS)
    .eq("nombre", nombre)
    .maybeSingle();

  return data ? filaAEmpresa(data as unknown as FilaEmpresa) : null;
});

export interface DatosEmpresa {
  razonSocial: string;
  rut: string;
  direccion: string;
  ciudad: string;
  email: string;
  telefono: string;
  representanteLegal: string;
  activo: boolean;
}

export async function actualizarEmpresa(id: string, datos: DatosEmpresa): Promise<void> {
  const { error } = await supabaseAdmin
    .from("cotizador_empresas")
    .update({
      razon_social: datos.razonSocial.trim(),
      rut: datos.rut.trim(),
      direccion: datos.direccion.trim(),
      ciudad: datos.ciudad.trim(),
      email: datos.email.trim(),
      telefono: datos.telefono.trim(),
      representante_legal: datos.representanteLegal.trim(),
      activo: datos.activo,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}
