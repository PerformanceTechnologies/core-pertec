"use server";

import { revalidatePath } from "next/cache";
import {
  actualizarContacto,
  actualizarPersona,
  archivarContacto,
  contactoPorRut,
  crearContacto,
  crearPersona,
  eliminarPersona,
  exigirAccesoContactos,
  importarDesdeOdoo,
  type ResultadoImportacion,
} from "@/lib/contactos";
import {
  LARGO,
  comunaOficial,
  correoValido,
  esTipoContribuyente,
  rutUsable,
  type DatosContacto,
  type DatosPersona,
} from "@/lib/contactos-modelo";
import { normalizarRut } from "@/lib/contratos/rut";

export type Resultado = { ok: true; id?: string } | { ok: false; error: string };

function fallo(e: unknown): { ok: false; error: string } {
  const error = e instanceof Error ? e.message.replace(/^\[contactos\]\s*/, "") : "Ocurrió un error inesperado.";
  return { ok: false, error };
}

function refrescar(id?: string): void {
  revalidatePath("/finanzas/contactos");
  if (id) revalidatePath(`/finanzas/contactos/${id}`);
}

const texto = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").replace(/\s+/g, " ").trim().slice(0, max) || null;

// ---------- Contactos ----------------------------------------------------------

/**
 * Lee y valida el formulario. Lo obligatorio para GUARDAR es poco (razón social, y un RUT válido
 * si se escribió): un contacto a medias sirve igual para encontrarlo. Lo que pide el SII para
 * FACTURAR se avisa en la ficha («Por completar»), no se exige acá. Lo que sí se hace cumplir son
 * los largos del SII y que la comuna sea una comuna de verdad.
 */
function leerContacto(fd: FormData): DatosContacto | string {
  const razonSocial = texto(fd, "razonSocial", 200);
  if (!razonSocial) return "La razón social es obligatoria.";
  if (razonSocial.length > LARGO.razonSocial) return `La razón social no puede pasar de ${LARGO.razonSocial} caracteres (límite del SII).`;

  const tipoContribuyente = esTipoContribuyente(fd.get("tipoContribuyente")) ? (fd.get("tipoContribuyente") as DatosContacto["tipoContribuyente"]) : "primera_categoria";
  const extranjero = tipoContribuyente === "extranjero";

  const rutCrudo = texto(fd, "rut", 20);
  const rut = rutCrudo && !extranjero ? normalizarRut(rutCrudo) : null;
  if (rut && !rutUsable(rut)) return "El RUT no es válido: revisa el dígito verificador.";

  const giro = texto(fd, "giro", 200);
  if (giro && giro.length > LARGO.giro) return `El giro no puede pasar de ${LARGO.giro} caracteres (límite del SII). Usa una versión corta.`;
  const direccion = texto(fd, "direccion", 200);
  if (direccion && direccion.length > LARGO.direccion) return `La dirección no puede pasar de ${LARGO.direccion} caracteres (límite del SII).`;

  const comunaEscrita = texto(fd, "comuna", 60);
  const comuna = extranjero ? null : comunaEscrita ? comunaOficial(comunaEscrita) : null;
  if (comunaEscrita && !extranjero && !comuna) return `«${comunaEscrita}» no es una comuna de Chile. Elígela de la lista.`;

  const correoDte = texto(fd, "correoDte", LARGO.correo)?.toLowerCase() ?? null;
  if (correoDte && !correoValido(correoDte)) return "El correo de intercambio DTE no es válido.";
  const correo = texto(fd, "correo", LARGO.correo)?.toLowerCase() ?? null;
  if (correo && !correoValido(correo)) return "El correo no es válido.";

  const plazo = String(fd.get("plazoPagoDias") ?? "");
  const plazoPagoDias = plazo === "" ? null : Number(plazo);
  if (plazoPagoDias !== null && (!Number.isInteger(plazoPagoDias) || plazoPagoDias < 0 || plazoPagoDias > 365)) return "El plazo de pago va de 0 a 365 días.";

  return {
    rut,
    tipoPersona: fd.get("tipoPersona") === "persona" ? "persona" : "empresa",
    razonSocial,
    giro,
    direccion,
    comuna,
    ciudad: texto(fd, "ciudad", LARGO.ciudad),
    pais: extranjero ? texto(fd, "pais", 60) ?? "Extranjero" : "Chile",
    tipoContribuyente,
    correoDte,
    correo,
    telefono: texto(fd, "telefono", LARGO.telefono),
    esCliente: fd.get("esCliente") === "on",
    esProveedor: fd.get("esProveedor") === "on",
    plazoPagoDias,
    notas: String(fd.get("notas") ?? "").trim().slice(0, 4000) || null,
  };
}

async function rutLibre(rut: string | null, salvo?: string): Promise<string | null> {
  if (!rut) return null;
  const otro = await contactoPorRut(rut);
  return otro && otro.id !== salvo ? `Ese RUT ya es de «${otro.razonSocial}».` : null;
}

export async function crearContactoAction(fd: FormData): Promise<Resultado> {
  try {
    const u = await exigirAccesoContactos();
    const d = leerContacto(fd);
    if (typeof d === "string") return { ok: false, error: d };
    const duplicado = await rutLibre(d.rut);
    if (duplicado) return { ok: false, error: duplicado };
    const id = await crearContacto(d, u.correo);
    refrescar(id);
    return { ok: true, id };
  } catch (e) {
    return fallo(e);
  }
}

export async function actualizarContactoAction(id: string, fd: FormData): Promise<Resultado> {
  try {
    const u = await exigirAccesoContactos();
    const d = leerContacto(fd);
    if (typeof d === "string") return { ok: false, error: d };
    const duplicado = await rutLibre(d.rut, id);
    if (duplicado) return { ok: false, error: duplicado };
    await actualizarContacto(id, d, u.correo);
    refrescar(id);
    return { ok: true, id };
  } catch (e) {
    return fallo(e);
  }
}

export async function archivarContactoAction(id: string, archivar: boolean): Promise<Resultado> {
  try {
    const u = await exigirAccesoContactos();
    await archivarContacto(id, archivar, u.correo);
    refrescar(id);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Personas de contacto ---------------------------------------------

function leerPersona(fd: FormData): DatosPersona | string {
  const nombre = texto(fd, "nombre", LARGO.persona);
  if (!nombre) return "El nombre es obligatorio.";
  const correo = texto(fd, "correo", LARGO.correo)?.toLowerCase() ?? null;
  if (correo && !correoValido(correo)) return "El correo no es válido.";
  return { nombre, cargo: texto(fd, "cargo", 80), correo, telefono: texto(fd, "telefono", LARGO.telefono), principal: fd.get("principal") === "on" };
}

export async function guardarPersonaAction(contactoId: string, personaId: string | null, fd: FormData): Promise<Resultado> {
  try {
    await exigirAccesoContactos();
    const d = leerPersona(fd);
    if (typeof d === "string") return { ok: false, error: d };
    if (personaId) await actualizarPersona(personaId, contactoId, d);
    else await crearPersona(contactoId, d);
    refrescar(contactoId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarPersonaAction(contactoId: string, personaId: string): Promise<Resultado> {
  try {
    await exigirAccesoContactos();
    await eliminarPersona(personaId, contactoId);
    refrescar(contactoId);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ---------- Odoo -------------------------------------------------------------

/** Solo el administrador: lee todo res.partner de Odoo y agrega lo que falte (ver importarDesdeOdoo). */
export async function importarDesdeOdooAction(): Promise<{ ok: true; resultado: ResultadoImportacion } | { ok: false; error: string }> {
  try {
    const u = await exigirAccesoContactos();
    if (u.rol !== "admin") return { ok: false, error: "Solo el administrador puede traer contactos desde Odoo." };
    const resultado = await importarDesdeOdoo(u.correo);
    refrescar();
    return { ok: true, resultado };
  } catch (e) {
    return fallo(e);
  }
}
