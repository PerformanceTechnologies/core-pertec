import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../supabase-admin";
import { cifrar, descifrar } from "../../cifrado";
import type { AccionRecibido, CesionDte, DocumentoDte, Iso } from "./modelo";
import type { CuentaSimpleFactura } from "./cuenta";
import { ErrorDte, type DocumentoRecibido, type EmisorDte, type ProveedorDte } from "./proveedor";
import {
  armarCesionSimpleFactura, armarDocumentoSimpleFactura, codigoAmbiente, fechaSf, mensajeError, motivoNota, respuestaAcuse, sucursalEnRuta, traducirEstado, traducirRecibido,
} from "./simplefactura-mapeo";

// -----------------------------------------------------------------------------
//  SimpleFactura: cliente HTTP (solo servidor).
//
//  Las credenciales NO están en el código ni en variables de entorno de la app: cada empresa tiene su cuenta,
//  cargada por el administrador del Core y guardada cifrada (lib/fin/dte/cuenta.ts). Este repositorio es público.
//
//  · La dirección es fija (api.simplefactura.cl): ningún dato guardado puede mandar la clave a otro sitio.
//  · El token se reutiliza (en memoria y cifrado en fin_dte_sesion): SimpleFactura da 10 por hora.
//  · Límite de la API: 2 llamadas por segundo. Las llamadas se espacian 550 ms dentro de cada instancia.
//  · Errores: el texto de SimpleFactura (sin el cuerpo completo). Un timeout o 502/503/504 al EMITIR es «incierto»:
//    el documento pudo haber salido, y el servicio no reintenta solo.
// -----------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = "https://api.simplefactura.cl";
const TIEMPO_CONSULTA_MS = 30_000;
const TIEMPO_EMISION_MS = 90_000;
const RUT_DEMO = "78181331-1";

/** RUT con que se emite: el de la empresa, salvo que la cuenta fije otro (cuenta demo). Nunca en producción. */
function rutEmisorForzado(c: CuentaSimpleFactura): string | null {
  return c.ambiente === "certificacion" ? c.rutEmisorPrueba?.trim().toUpperCase() || null : null;
}

export function emisorForzado(c: CuentaSimpleFactura | null): boolean {
  return Boolean(c && rutEmisorForzado(c));
}

// ---------- Token ----------------------------------------------------------------------------------

const enMemoria = new Map<string, { token: string; expira: number; huella: string }>();

/** Cambia si cambia el usuario: así un token viejo no se usa con credenciales nuevas (sin guardar el correo en claro). */
const huellaDe = (c: CuentaSimpleFactura) => createHash("sha256").update(`${c.clave}|${c.email ?? ""}|sf`).digest("hex").slice(0, 24);

async function token(c: CuentaSimpleFactura, forzarNuevo = false): Promise<string> {
  if (c.token) return c.token;
  if (!c.email || !c.password) throw new ErrorDte("La cuenta de SimpleFactura no tiene usuario y clave.", "sin_configurar", 0);
  const huella = huellaDe(c);
  const ahora = Date.now();
  const mem = enMemoria.get(c.clave);
  if (!forzarNuevo && mem && mem.huella === huella && mem.expira - ahora > 5 * 60_000) return mem.token;
  if (!forzarNuevo) {
    const { data } = await supabaseAdmin.from("fin_dte_sesion").select("token_cifrado, expira_en").eq("clave", c.clave).maybeSingle();
    if (data && Date.parse(data.expira_en) - ahora > 5 * 60_000) {
      try {
        const [h, t] = descifrar(data.token_cifrado).split("\n");
        if (h === huella && t) {
          enMemoria.set(c.clave, { token: t, expira: Date.parse(data.expira_en), huella });
          return t;
        }
      } catch {
        /* llave de cifrado cambió: se pide uno nuevo */
      }
    }
  }
  const r = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: c.email, password: c.password }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIEMPO_CONSULTA_MS),
  });
  const cuerpo = (await r.json().catch(() => null)) as { accessToken?: string; expiresAt?: string; expiresIn?: number; message?: string } | null;
  if (!r.ok || !cuerpo?.accessToken) {
    if (r.status === 429) throw new ErrorDte("SimpleFactura: se superó el límite de 10 inicios de sesión por hora. Espera unos minutos.", "limite_token", 429);
    throw new ErrorDte(`SimpleFactura no aceptó las credenciales (${cuerpo?.message ?? `HTTP ${r.status}`}).`, "credenciales", r.status);
  }
  const expira = cuerpo.expiresAt ? Date.parse(cuerpo.expiresAt) : ahora + (cuerpo.expiresIn ?? 3600) * 1000;
  enMemoria.set(c.clave, { token: cuerpo.accessToken, expira, huella });
  await supabaseAdmin
    .from("fin_dte_sesion")
    .upsert({ clave: c.clave, token_cifrado: cifrar(`${huella}\n${cuerpo.accessToken}`), expira_en: new Date(expira).toISOString(), actualizado_en: new Date().toISOString() });
  return cuerpo.accessToken;
}

// ---------- Llamadas -------------------------------------------------------------------------------

let ultimaLlamada = 0;
async function turno(): Promise<void> {
  const espera = ultimaLlamada + 550 - Date.now();
  ultimaLlamada = Math.max(Date.now(), ultimaLlamada + 550);
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
}

interface Opciones {
  binario?: boolean;
  emision?: boolean;
}

async function llamarCon(c: CuentaSimpleFactura, ruta: string, body: unknown, op: Opciones = {}): Promise<any> {
  for (let intento = 0; intento < 2; intento++) {
    await turno();
    let r: Response;
    try {
      r = await fetch(`${BASE}${ruta}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await token(c, intento > 0)}`, "Content-Type": "application/json", Accept: op.binario ? "*/*" : "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(op.emision ? TIEMPO_EMISION_MS : TIEMPO_CONSULTA_MS),
      });
    } catch (e) {
      const nombre = e instanceof Error ? e.name : "";
      throw new ErrorDte(`SimpleFactura no respondió a tiempo (${nombre || "red"}).`, "sin_respuesta", 0, Boolean(op.emision));
    }
    // Token vencido o revocado: uno nuevo y se repite una sola vez (si no es un token fijo).
    if (r.status === 401 && intento === 0 && !c.token) continue;
    if (r.status === 429) throw new ErrorDte("SimpleFactura pidió bajar el ritmo (máx. 2 llamadas por segundo). Intenta de nuevo en un momento.", "limite", 429);
    if (op.binario && r.ok) {
      const tipo = r.headers.get("content-type") ?? "";
      if (!tipo.includes("json")) return Buffer.from(await r.arrayBuffer());
    }
    const texto = await r.text();
    let cuerpo: any = texto;
    try {
      cuerpo = texto ? JSON.parse(texto) : null;
    } catch {
      /* XML o texto */
    }
    const errores = Array.isArray(cuerpo?.errors) && cuerpo.errors.length > 0;
    if (!r.ok || errores || (cuerpo && typeof cuerpo === "object" && typeof cuerpo.status === "number" && cuerpo.status >= 400)) {
      // 500 CON errores[] es una validación (no salió). 502/503/504 o 500 sin explicación al emitir: no se sabe.
      const incierto = Boolean(op.emision) && !errores && (r.status >= 502 || (r.status === 500 && !cuerpo?.data));
      throw new ErrorDte(`SimpleFactura: ${mensajeError(cuerpo, r.status)}`, `http_${r.status}`, r.status, incierto);
    }
    if (op.binario) return Buffer.from(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), "latin1");
    return cuerpo;
  }
  throw new ErrorDte("SimpleFactura rechazó la sesión dos veces seguidas: revisa las credenciales.", "credenciales", 401);
}

// ---------- Emisor efectivo (cuenta demo) -------------------------------------------------------------

const datosForzado = new Map<string, Partial<EmisorDte>>();

/**
 * En certificación con SIMPLEFACTURA_RUT_EMISOR, se emite como esa empresa (la cuenta demo de SimpleFactura no deja
 * emitir con el RUT propio): sus datos salen de POST /datosEmpresa. La sucursal y el acteco quedan los configurados,
 * salvo la demo, que usa los de sus ejemplos oficiales.
 */
async function emisorEfectivoCon(c: CuentaSimpleFactura, e: EmisorDte): Promise<EmisorDte> {
  const rut = rutEmisorForzado(c);
  if (!rut || rut === e.rut) return e;
  let datos = datosForzado.get(rut);
  if (!datos) {
    const r = await llamarCon(c, "/datosEmpresa", { rutEmisor: rut });
    const d = r?.data ?? {};
    datos = {
        razonSocial: d.razonSocial ?? undefined,
        giro: d.giro ?? undefined,
        direccion: d.dirFact ?? d.dirPart ?? undefined,
        comuna: d.comuna ?? undefined,
        ciudad: d.ciudad ?? undefined,
        correo: d.correoFact ?? d.correoPar ?? undefined,
        telefono: d.telefono ? String(d.telefono) : undefined,
        acteco: Number(d.actividadesEconomicas?.[0]?.codigo) || undefined,
    };
    datosForzado.set(rut, datos);
  }
  const demo = rut === RUT_DEMO;
  return {
    ...e,
    ...Object.fromEntries(Object.entries(datos).filter(([, v]) => v)),
    rut,
    acteco: datos.acteco ?? (demo ? 620200 : e.acteco),
    sucursal: demo ? "Casa Matriz" : e.sucursal,
  };
}

// ---------- El proveedor ---------------------------------------------------------------------------------

export function crearProveedorSimpleFactura(c: CuentaSimpleFactura): ProveedorDte {
  const ambiente = c.ambiente;
  const llamar = (ruta: string, body: unknown, op?: Opciones) => llamarCon(c, ruta, body, op);
  const emisorEfectivo = (e: EmisorDte) => emisorEfectivoCon(c, e);
  const amb = codigoAmbiente(ambiente);
  const ref = (e: EmisorDte, tipo: number, folio: string) => ({
    credenciales: { rutEmisor: e.rut, nombreSucursal: e.sucursal },
    // tipoPapel 3 = carta (el de omisión de la demo es rollo de 80 mm, que no imprime la descripción ni el tipo de referencia).
    dteReferenciadoExterno: { folio: Number(folio), codigoTipoDte: tipo, ambiente: amb, tipoPapel: 3 },
  });

  return {
    nombre: "SimpleFactura",
    ambiente,

    async probarConexion(emisorBase) {
      const e = await emisorEfectivo(emisorBase);
      const r = await llamar("/branchOffices", { rutEmisor: e.rut });
      const sucursales: string[] = (r?.data ?? []).map((s: any) => String(s?.nombre ?? "")).filter(Boolean);
      const calza = sucursales.some((s) => s.toLowerCase() === e.sucursal.toLowerCase());
      if (!calza) return { ok: false, detalle: `Conectado a SimpleFactura como ${e.rut}, pero la sucursal «${e.sucursal}» no existe. Sucursales: ${sucursales.join(", ") || "ninguna"}.` };
      const datos = await llamar("/datosEmpresa", { rutEmisor: e.rut }).catch(() => null);
      const nombre = datos?.data?.razonSocial ? ` (${datos.data.razonSocial})` : "";
      return { ok: true, detalle: `Conectado a SimpleFactura: ${e.rut}${nombre}, sucursal «${e.sucursal}», ambiente ${ambiente === "produccion" ? "producción" : "certificación"}.` };
    },

    async emitir(emisorBase, doc: DocumentoDte, tasaIva) {
      const e = await emisorEfectivo(emisorBase);
      const body = armarDocumentoSimpleFactura(e, doc, tasaIva);
      const ruta = doc.tipo === 61 || doc.tipo === 56 ? `/invoiceCreditDebitNotesV2/${sucursalEnRuta(e.sucursal)}/${motivoNota(doc)}` : `/invoiceV2/${sucursalEnRuta(e.sucursal)}`;
      const r = await llamar(ruta, body, { emision: true });
      const folio = r?.data?.folio;
      if (folio === undefined || folio === null || !Number(folio)) {
        // Dijo que sí pero sin folio: no se sabe qué pasó; se marca incierto para revisar antes de repetir.
        throw new ErrorDte(`SimpleFactura respondió sin folio (${mensajeError(r, 200)}).`, "sin_folio", 200, true);
      }
      return { folio: String(folio), trackId: null, estadoSii: "pendiente", crudo: { message: r?.message ?? null, data: r?.data ?? null } };
    },

    async consultarEstado(emisorBase, tipoDte, folio) {
      const e = await emisorEfectivo(emisorBase);
      const r = await llamar("/documentIssued", { credenciales: { rutEmisor: e.rut }, dteReferenciadoExterno: { folio: Number(folio), codigoTipoDte: tipoDte, ambiente: amb } });
      return traducirEstado(r?.data);
    },

    async pdf(emisorBase, tipoDte, folio) {
      const e = await emisorEfectivo(emisorBase);
      return llamar("/dte/pdf", ref(e, tipoDte, folio), { binario: true });
    },

    async xml(emisorBase, tipoDte, folio) {
      const e = await emisorEfectivo(emisorBase);
      return llamar("/dte/xml", { credenciales: { rutEmisor: e.rut }, dteReferenciadoExterno: { folio: Number(folio), codigoTipoDte: tipoDte, ambiente: amb } }, { binario: true });
    },

    async enviarPorCorreo(emisorBase, tipoDte, folio, correos) {
      const e = await emisorEfectivo(emisorBase);
      await llamar("/dte/enviar/mail", { rutEmpresa: e.rut, dte: { folio: Number(folio), tipoDTE: tipoDte }, mail: { to: correos, ccos: [], ccs: [] }, xml: true, pdf: true });
    },

    async recibidos(emisorBase, desde: Iso, hasta: Iso): Promise<DocumentoRecibido[]> {
      const e = await emisorEfectivo(emisorBase);
      const r = await llamar("/documentsReceived", { credenciales: { rutEmisor: e.rut }, ambiente: amb, folio: null, codigoTipoDte: null, desde, hasta });
      const filas: any[] = Array.isArray(r?.data) ? r.data : [];
      return filas.map(traducirRecibido).filter((x): x is DocumentoRecibido => x !== null);
    },

    async responderRecibido(emisorBase, d, accion: AccionRecibido, motivo) {
      const e = await emisorEfectivo(emisorBase);
      const { respuesta, tipoRechazo } = respuestaAcuse(accion);
      await llamar("/acknowledgmentReceipt", {
        credenciales: { rutEmisor: e.rut, rutContribuyente: d.rutEmisor, nombreSucursal: e.sucursal },
        dteReferenciadoExterno: { folio: Number(d.folio), codigoTipoDte: d.tipoDte, ambiente: amb },
        respuesta,
        tipoRechazo,
        comentario: motivo ?? "",
      });
    },

    async pdfRecibido(emisorBase, d) {
      const e = await emisorEfectivo(emisorBase);
      return llamar("/documentReceived/getPdf", { credenciales: { rutEmisor: e.rut, rutContribuyente: d.rutEmisor }, ambiente: amb, folio: Number(d.folio), codigoTipoDte: d.tipoDte }, { binario: true });
    },

    async ceder(emisorBase, c: CesionDte) {
      const e = await emisorEfectivo(emisorBase);
      const cred = { rutEmisor: e.rut, nombreSucursal: e.sucursal };
      // 1) El cesionario tiene que existir en SimpleFactura: se registra si falta.
      const ces = await llamar("/cessions/cesionarios", { credenciales: cred, RutCesionario: c.cesionarioRut, incluirInactivos: false }).catch(() => null);
      const existe = (ces?.data ?? []).some((x: any) => String(x?.rutCesionario ?? "").toUpperCase() === c.cesionarioRut.toUpperCase());
      if (!existe) {
        await llamar("/cessions/cesionarios/agregar", {
          credenciales: cred, rutCesionario: c.cesionarioRut, razonSocial: c.cesionarioRazonSocial, direccion: c.cesionarioDireccion, correo: c.cesionarioCorreo, fono: 0, nombreContacto: c.cesionarioRazonSocial,
        });
      }
      // 2) La persona autorizada también. Si ya existía, SimpleFactura responde error («ya existe», a veces sin 409): está bien.
      await llamar("/cessions/personasAutorizadas/agregar", { credenciales: { rutEmisor: e.rut }, rutPersonaAutorizada: c.personaAutorizada.rut, nombre: c.personaAutorizada.nombre, correo: c.personaAutorizada.correo }).catch((err) => {
        if (!(err instanceof ErrorDte && (err.status === 409 || /ya existe/i.test(err.message)))) throw err;
      });
      // 3) La cesión. Es asíncrona en el SII: el resultado final se ve en las trazas.
      const r = await llamar("/cederFactura", armarCesionSimpleFactura(e, c), { emision: true });
      return { trackId: null, crudo: { message: r?.message ?? null, data: r?.data ?? null } };
    },

    async folios(emisorBase, tipoDte) {
      const e = await emisorEfectivo(emisorBase);
      const r = await llamar("/folios/consultar/sin-uso", { rutEmpresa: e.rut, tipoDTE: tipoDte, ambiente: amb });
      const rangos: any[] = Array.isArray(r?.data) ? r.data : [];
      const disponibles = rangos.reduce((s, x) => s + (Number(x?.cantidad) || 0), 0);
      return { tipoDte, disponibles, detalle: rangos.map((x) => `${x.desde}–${x.hasta}`).join(", ") || null };
    },
  };
}

/** Busca en SimpleFactura un emitido que calce (para resolver un envío que quedó en duda). */
export async function buscarEmitido(c: CuentaSimpleFactura, emisorBase: EmisorDte, tipoDte: number, rutReceptor: string, fecha: Iso, total: number): Promise<string[]> {
  const e = await emisorEfectivoCon(c, emisorBase);
  const r = await llamarCon(c, "/documentsIssued", {
    credenciales: { rutEmisor: e.rut, rutContribuyente: rutReceptor, nombreSucursal: e.sucursal },
    ambiente: codigoAmbiente(c.ambiente),
    folio: null,
    codigoTipoDte: tipoDte,
    desde: fecha,
    hasta: fecha,
  });
  const filas: any[] = Array.isArray(r?.data) ? r.data : [];
  return filas.filter((x) => Math.round(Number(x?.total)) === total && (fechaSf(x?.fechaDte ?? x?.fechaEmision) ?? fecha) === fecha).map((x) => String(x.folio));
}

/** Trazas de una cesión (el SII la procesa después): texto para mostrar. */
export async function trazasCesion(c: CuentaSimpleFactura, emisorBase: EmisorDte, folio: string): Promise<{ fecha: string; descripcion: string }[]> {
  const e = await emisorEfectivoCon(c, emisorBase);
  const r = await llamarCon(c, "/cessions/trazasIssued", { credenciales: { rutEmisor: e.rut }, folio: Number(folio), ambiente: codigoAmbiente(c.ambiente) }).catch(() => null);
  return (Array.isArray(r?.data) ? r.data : []).map((x: any) => ({ fecha: String(x?.fecha ?? ""), descripcion: String(x?.descripcion ?? "") }));
}
