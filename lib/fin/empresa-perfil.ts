import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabaseAdmin } from "../supabase-admin";
import { logoCompletoDe } from "../empresas-modelo";

// -----------------------------------------------------------------------------
//  Datos de cada empresa para el PDF de la cotización (solo servidor).
//
//  Viven en la tabla `empresas` (una fila por empresa del grupo). Se leen siempre con el id de la empresa
//  ACTIVA: PERTEC, Zeus y Performance Service cada una con su dirección, sus datos bancarios y su logo.
// -----------------------------------------------------------------------------

export interface PerfilEmpresa {
  id: string;
  slug: string;
  nombre: string;
  rut: string | null;
  direccion: string | null;
  giro: string | null;
  telefono: string | null;
  correo: string | null;
  web: string | null;
  datosBancarios: string | null;
  pie: string | null;
  prefijo: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function perfilDeEmpresa(empresaId: string): Promise<PerfilEmpresa> {
  const { data, error } = await supabaseAdmin.from("empresas").select("*").eq("id", empresaId).single();
  if (error || !data) throw new Error("[fin] No se pudo leer la empresa.");
  const r = data as any;
  return {
    id: r.id, slug: r.slug, nombre: r.nombre, rut: r.rut ?? null, direccion: r.direccion ?? null, giro: r.giro ?? null, telefono: r.telefono ?? null,
    correo: r.correo_comercial ?? null, web: r.web ?? null, datosBancarios: r.datos_bancarios ?? null, pie: r.pie_cotizacion ?? null, prefijo: r.prefijo_cotizacion ?? "COT",
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Lo que falta para que el PDF salga completo (se muestra como aviso, no bloquea). */
export function faltantesDelPerfil(p: PerfilEmpresa): string[] {
  const falta: string[] = [];
  if (!p.rut) falta.push("RUT");
  if (!p.direccion) falta.push("dirección");
  if (!p.telefono && !p.correo) falta.push("teléfono o correo");
  if (!p.datosBancarios) falta.push("datos bancarios");
  return falta;
}

/** El logo de la empresa como data URI (para incrustarlo en el PDF sin depender de la red). Null si no hay archivo. */
export async function logoComoDataUri(slug: string): Promise<string | null> {
  const rutas = logoCompletoDe(slug);
  if (!rutas) return null;
  try {
    // Ruta fija de /public: el slug sale de nuestra tabla, y logoCompletoDe solo devuelve archivos conocidos.
    const buf = await readFile(path.join(process.cwd(), "public", rutas.claro));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
