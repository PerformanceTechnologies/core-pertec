import "server-only";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "./supabase-admin";
import { exigirAccesoApp } from "./autorizacion";
import { usuarioPuedeVerSubpanelFinanzas } from "./finanzas-subpaneles-usuario";
import type { UsuarioConAcceso } from "./tipos";
import { odooSearchRead } from "./odoo/cliente";
import {
  SLUG_SUBPANEL_CONTACTOS,
  CAMPOS_ODOO,
  contactosDesdeOdoo,
  type Contacto,
  type ContactoConPersonas,
  type DatosContacto,
  type DatosPersona,
  type FilaOdoo,
  type Persona,
} from "./contactos-modelo";

// -----------------------------------------------------------------------------
//  Capa de datos de Contactos (solo servidor). Lee y escribe las tablas
//  finanzas_contactos y finanzas_contacto_personas. Las reglas puras (qué falta
//  para facturar, cómo se traduce Odoo) viven en contactos-modelo.
// -----------------------------------------------------------------------------

/**
 * Contactos es un subpanel de Finanzas: hace falta la app «finanzas» y, salvo el admin, el permiso
 * fino del subpanel (ver lib/finanzas-subpaneles-usuario.ts). Sin permiso, de vuelta a Finanzas.
 */
export async function exigirAccesoContactos(): Promise<UsuarioConAcceso> {
  const usuario = await exigirAccesoApp("finanzas");
  if (usuario.rol !== "admin" && !(await usuarioPuedeVerSubpanelFinanzas(usuario.id, SLUG_SUBPANEL_CONTACTOS))) {
    redirect("/finanzas");
  }
  return usuario;
}

const T = { contactos: "finanzas_contactos", personas: "finanzas_contacto_personas" } as const;

function revienta(que: string, error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === "23505" && /rut/i.test(error.message)) throw new Error("[contactos] Ya existe un contacto con ese RUT.");
  throw new Error(`[contactos] No se pudo ${que}: ${error.message}`);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const aContacto = (r: any): Contacto => ({
  id: r.id, rut: r.rut, tipoPersona: r.tipo_persona, razonSocial: r.razon_social, giro: r.giro,
  direccion: r.direccion, comuna: r.comuna, ciudad: r.ciudad, pais: r.pais, tipoContribuyente: r.tipo_contribuyente,
  correoDte: r.correo_dte, correo: r.correo, telefono: r.telefono, esCliente: r.es_cliente, esProveedor: r.es_proveedor,
  plazoPagoDias: r.plazo_pago_dias, notas: r.notas, activo: r.activo, odooId: r.odoo_id, odooIds: r.odoo_ids ?? [],
  creadoPor: r.creado_por, actualizadoPor: r.actualizado_por, creadoEn: r.creado_en, actualizadoEn: r.actualizado_en,
});
const aPersona = (r: any): Persona => ({
  id: r.id, contactoId: r.contacto_id, nombre: r.nombre, cargo: r.cargo, correo: r.correo, telefono: r.telefono, principal: r.principal,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const aFila = (d: DatosContacto) => ({
  rut: d.rut, tipo_persona: d.tipoPersona, razon_social: d.razonSocial, giro: d.giro, direccion: d.direccion,
  comuna: d.comuna, ciudad: d.ciudad, pais: d.pais, tipo_contribuyente: d.tipoContribuyente, correo_dte: d.correoDte,
  correo: d.correo, telefono: d.telefono, es_cliente: d.esCliente, es_proveedor: d.esProveedor,
  plazo_pago_dias: d.plazoPagoDias, notas: d.notas,
});

// ---------- Contactos ----------------------------------------------------------

export async function listarContactos(): Promise<(Contacto & { personas: number })[]> {
  const [{ data, error }, personas] = await Promise.all([
    supabaseAdmin.from(T.contactos).select("*").order("razon_social"),
    supabaseAdmin.from(T.personas).select("contacto_id"),
  ]);
  revienta("listar los contactos", error);
  revienta("contar las personas", personas.error);
  const cuenta = new Map<string, number>();
  for (const p of personas.data ?? []) cuenta.set(p.contacto_id, (cuenta.get(p.contacto_id) ?? 0) + 1);
  return (data ?? []).map((r) => ({ ...aContacto(r), personas: cuenta.get(r.id) ?? 0 }));
}

export async function obtenerContacto(id: string): Promise<ContactoConPersonas | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [{ data, error }, personas] = await Promise.all([
    supabaseAdmin.from(T.contactos).select("*").eq("id", id).maybeSingle(),
    supabaseAdmin.from(T.personas).select("*").eq("contacto_id", id).order("principal", { ascending: false }).order("nombre"),
  ]);
  revienta("leer el contacto", error);
  revienta("leer las personas", personas.error);
  return data ? { ...aContacto(data), personas: (personas.data ?? []).map(aPersona) } : null;
}

/** El contacto que ya tiene ese RUT, para avisar antes de duplicarlo. */
export async function contactoPorRut(rut: string): Promise<{ id: string; razonSocial: string } | null> {
  const { data, error } = await supabaseAdmin.from(T.contactos).select("id, razon_social").eq("rut", rut).maybeSingle();
  revienta("buscar el RUT", error);
  return data ? { id: data.id, razonSocial: data.razon_social } : null;
}

export async function crearContacto(d: DatosContacto, quien: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from(T.contactos)
    .insert({ ...aFila(d), creado_por: quien, actualizado_por: quien })
    .select("id")
    .single();
  revienta("crear el contacto", error);
  return data!.id as string;
}

export async function actualizarContacto(id: string, d: DatosContacto, quien: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.contactos)
    .update({ ...aFila(d), actualizado_por: quien, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  revienta("guardar el contacto", error);
}

/** Archivar no borra: el contacto sale de las listas pero sus datos quedan (y vuelve con un clic). */
export async function archivarContacto(id: string, archivar: boolean, quien: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from(T.contactos)
    .update({ activo: !archivar, actualizado_por: quien, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  revienta(archivar ? "archivar el contacto" : "reactivar el contacto", error);
}

// ---------- Personas de contacto ---------------------------------------------

const aFilaPersona = (d: DatosPersona) => ({ nombre: d.nombre, cargo: d.cargo, correo: d.correo, telefono: d.telefono, principal: d.principal });

/** Solo una persona es el «Atención A:» de la factura: marcar una desmarca a las demás. */
async function soltarPrincipal(contactoId: string, salvo?: string): Promise<void> {
  let q = supabaseAdmin.from(T.personas).update({ principal: false }).eq("contacto_id", contactoId);
  if (salvo) q = q.neq("id", salvo);
  const { error } = await q;
  revienta("cambiar el contacto principal", error);
}

export async function crearPersona(contactoId: string, d: DatosPersona): Promise<void> {
  if (d.principal) await soltarPrincipal(contactoId);
  const { count } = await supabaseAdmin.from(T.personas).select("id", { count: "exact", head: true }).eq("contacto_id", contactoId);
  const { error } = await supabaseAdmin.from(T.personas).insert({ contacto_id: contactoId, ...aFilaPersona({ ...d, principal: d.principal || !count }) });
  revienta("agregar la persona", error);
}

export async function actualizarPersona(id: string, contactoId: string, d: DatosPersona): Promise<void> {
  if (d.principal) await soltarPrincipal(contactoId, id);
  const { error } = await supabaseAdmin.from(T.personas).update(aFilaPersona(d)).eq("id", id).eq("contacto_id", contactoId);
  revienta("guardar la persona", error);
}

export async function eliminarPersona(id: string, contactoId: string): Promise<void> {
  const { error } = await supabaseAdmin.from(T.personas).delete().eq("id", id).eq("contacto_id", contactoId);
  revienta("quitar la persona", error);
}

// ---------- Importar desde Odoo ------------------------------------------------

export interface ResultadoImportacion {
  leidos: number;
  nuevos: number;
  yaEstaban: number;
  personasNuevas: number;
  omitidos: number;
}

/**
 * Trae los contactos de Odoo (res.partner) que todavía no están en el Core.
 *
 * Solo AGREGA: un contacto que ya existe —por su RUT o porque alguna de sus fichas de Odoo ya se
 * importó— no se toca, aunque en Odoo haya cambiado, porque acá pudieron haberlo corregido. Así se
 * puede correr las veces que haga falta. A los que ya estaban solo se les suman las personas de
 * contacto nuevas. En Odoo solo se lee.
 */
export async function importarDesdeOdoo(quien: string): Promise<ResultadoImportacion> {
  const [filas, empresas] = await Promise.all([
    odooSearchRead<FilaOdoo>("res.partner", [["active", "in", [true, false]]], CAMPOS_ODOO as string[], { order: "id asc" }),
    odooSearchRead<{ partner_id: [number, string] }>("res.company", [], ["partner_id"]),
  ]);
  const { contactos, omitidos } = contactosDesdeOdoo(filas, empresas.map((e) => e.partner_id[0]));

  const [existentes, personas] = await Promise.all([
    supabaseAdmin.from(T.contactos).select("id, rut, odoo_id, odoo_ids"),
    supabaseAdmin.from(T.personas).select("odoo_id").not("odoo_id", "is", null),
  ]);
  revienta("leer los contactos existentes", existentes.error);
  revienta("leer las personas existentes", personas.error);
  const porRut = new Map<string, string>();
  const porOdoo = new Map<number, string>();
  for (const e of existentes.data ?? []) {
    if (e.rut) porRut.set(e.rut, e.id);
    for (const o of [e.odoo_id, ...(e.odoo_ids ?? [])]) if (o) porOdoo.set(o, e.id);
  }
  const personasYaImportadas = new Set((personas.data ?? []).map((p) => p.odoo_id as number));

  let nuevos = 0;
  let yaEstaban = 0;
  let personasNuevas = 0;
  for (const c of contactos) {
    let id = (c.rut && porRut.get(c.rut)) || c.odooIds.map((o) => porOdoo.get(o)).find(Boolean) || null;
    const yaEstaba = Boolean(id);
    if (yaEstaba) yaEstaban++;
    else {
      const { data, error } = await supabaseAdmin
        .from(T.contactos)
        .insert({ ...aFila(c), odoo_id: c.odooId, odoo_ids: c.odooIds, creado_por: "Importado desde Odoo", actualizado_por: quien })
        .select("id")
        .single();
      revienta(`importar «${c.razonSocial}»`, error);
      id = data!.id as string;
      nuevos++;
    }
    const faltan = c.personas.filter((p) => !personasYaImportadas.has(p.odooId));
    if (faltan.length) {
      const { error } = await supabaseAdmin.from(T.personas).insert(
        // A un contacto que ya estaba no se le cambia su «Atención A:».
        faltan.map((p) => ({ contacto_id: id, odoo_id: p.odooId, ...aFilaPersona({ ...p, principal: p.principal && !yaEstaba }) })),
      );
      revienta(`importar las personas de «${c.razonSocial}»`, error);
      personasNuevas += faltan.length;
    }
  }
  return { leidos: filas.length, nuevos, yaEstaban, personasNuevas, omitidos: omitidos.length };
}
