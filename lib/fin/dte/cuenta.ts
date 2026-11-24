import "server-only";
import { supabaseAdmin } from "../../supabase-admin";
import { cifrar, descifrar } from "../../cifrado";
import type { Ambiente } from "./proveedor";

// -----------------------------------------------------------------------------
//  La cuenta del proveedor de facturación de cada empresa (solo servidor).
//
//  La carga el administrador del Core en Administración › Integraciones. Las credenciales quedan cifradas en
//  fin_dte_cuentas y NUNCA vuelven a la pantalla: la página solo sabe si hay una cargada y cuándo se probó.
//  Mientras emision_habilitada sea false, el Core puede consultar (estados, PDF, recibidos) pero no emitir ni ceder.
// -----------------------------------------------------------------------------

/** Lo que necesita el cliente de SimpleFactura para hablar con la API. Vive solo en memoria del servidor. */
export interface CuentaSimpleFactura {
  /** Identifica la cuenta para el caché del token (nunca se muestra). */
  clave: string;
  email: string | null;
  password: string | null;
  /** «Token de integración» de developers.simplefactura.cl (alternativa a usuario y clave). */
  token: string | null;
  ambiente: Ambiente;
  /** Solo certificación: emitir con otro RUT (la cuenta demo de SimpleFactura). */
  rutEmisorPrueba: string | null;
}

/** Lo que la pantalla puede saber de la cuenta (sin secretos). */
export interface EstadoCuentaDte {
  cargada: boolean;
  metodo: "usuario" | "token" | null;
  ambiente: Ambiente;
  rutEmisorPrueba: string | null;
  emisionHabilitada: boolean;
  carpetaSp: string | null;
  probadoEn: string | null;
  probadoOk: boolean | null;
  probadoDetalle: string | null;
  actualizadoPor: string | null;
  actualizadoEn: string | null;
}

interface Fila {
  empresa_id: string;
  ambiente: Ambiente;
  usuario_cifrado: string | null;
  clave_cifrada: string | null;
  token_cifrado: string | null;
  rut_emisor_prueba: string | null;
  emision_habilitada: boolean;
  carpeta_sp: string | null;
  probado_en: string | null;
  probado_ok: boolean | null;
  probado_detalle: string | null;
  actualizado_por: string | null;
  actualizado_en: string | null;
}

/** Si la tabla aún no existe (falta correr la migración 0016), se comporta como «sin cuenta». */
async function leerFila(empresaId: string): Promise<Fila | null> {
  const { data, error } = await supabaseAdmin.from("fin_dte_cuentas").select("*").eq("empresa_id", empresaId).maybeSingle();
  if (error) {
    if (/fin_dte_cuentas/.test(error.message) || error.code === "42P01" || error.code === "PGRST205") return null;
    throw new Error(`No se pudo leer la cuenta de facturación: ${error.message}`);
  }
  return (data as Fila | null) ?? null;
}

function descifrarONulo(v: string | null): string | null {
  if (!v) return null;
  try {
    return descifrar(v);
  } catch {
    return null; // la llave de cifrado cambió: la cuenta hay que volver a cargarla
  }
}

export async function estadoCuentaDte(empresaId: string): Promise<EstadoCuentaDte> {
  const f = await leerFila(empresaId);
  const metodo = f?.token_cifrado ? "token" : f?.usuario_cifrado && f?.clave_cifrada ? "usuario" : null;
  return {
    cargada: metodo !== null,
    metodo,
    ambiente: f?.ambiente ?? "certificacion",
    rutEmisorPrueba: f?.rut_emisor_prueba ?? null,
    emisionHabilitada: Boolean(f?.emision_habilitada) && metodo !== null,
    carpetaSp: f?.carpeta_sp ?? null,
    probadoEn: f?.probado_en ?? null,
    probadoOk: f?.probado_ok ?? null,
    probadoDetalle: f?.probado_detalle ?? null,
    actualizadoPor: f?.actualizado_por ?? null,
    actualizadoEn: f?.actualizado_en ?? null,
  };
}

/** Las credenciales descifradas, o null si la empresa no tiene cuenta cargada (o no se pueden descifrar). */
export async function cuentaSimpleFactura(empresaId: string): Promise<CuentaSimpleFactura | null> {
  const f = await leerFila(empresaId);
  if (!f) return null;
  const token = descifrarONulo(f.token_cifrado);
  const email = descifrarONulo(f.usuario_cifrado);
  const password = descifrarONulo(f.clave_cifrada);
  if (!token && !(email && password)) return null;
  return {
    clave: empresaId,
    email,
    password,
    token,
    ambiente: f.ambiente,
    rutEmisorPrueba: f.ambiente === "certificacion" ? f.rut_emisor_prueba : null,
  };
}

/** Para los scripts de prueba locales (scripts/e2e-simplefactura.mts): la cuenta desde .env.local. Nunca en la app. */
export function cuentaDesdeEntorno(): CuentaSimpleFactura | null {
  const email = process.env.SIMPLEFACTURA_EMAIL?.trim() || null;
  const password = process.env.SIMPLEFACTURA_PASSWORD?.trim() || null;
  const token = process.env.SIMPLEFACTURA_TOKEN?.trim() || null;
  if (!token && !(email && password)) return null;
  const ambiente: Ambiente = process.env.SIMPLEFACTURA_AMBIENTE?.trim().toLowerCase() === "produccion" ? "produccion" : "certificacion";
  return { clave: "entorno", email, password, token, ambiente, rutEmisorPrueba: ambiente === "certificacion" ? process.env.SIMPLEFACTURA_RUT_EMISOR?.trim().toUpperCase() || null : null };
}

export interface CambioCuenta {
  /** Si viene, reemplaza las credenciales (y borra las del otro método). Vacío = se conservan las guardadas. */
  email?: string | null;
  password?: string | null;
  token?: string | null;
  ambiente?: Ambiente;
  rutEmisorPrueba?: string | null;
  emisionHabilitada?: boolean;
  carpetaSp?: string | null;
}

export async function guardarCuentaDte(empresaId: string, c: CambioCuenta, quien: string): Promise<void> {
  const actual = await leerFila(empresaId);
  const fila: Record<string, unknown> = { empresa_id: empresaId, actualizado_por: quien, actualizado_en: new Date().toISOString() };
  const nuevasCred = Boolean(c.token) || Boolean(c.email && c.password);
  if (c.token) {
    Object.assign(fila, { token_cifrado: cifrar(c.token), usuario_cifrado: null, clave_cifrada: null });
  } else if (c.email && c.password) {
    Object.assign(fila, { usuario_cifrado: cifrar(c.email), clave_cifrada: cifrar(c.password), token_cifrado: null });
  }
  if (c.ambiente) fila.ambiente = c.ambiente;
  if (c.rutEmisorPrueba !== undefined) fila.rut_emisor_prueba = c.rutEmisorPrueba || null;
  if (c.carpetaSp !== undefined) fila.carpeta_sp = c.carpetaSp || null;
  if (c.emisionHabilitada !== undefined) fila.emision_habilitada = c.emisionHabilitada;
  // Cambiar credenciales o ambiente invalida la última prueba y apaga la emisión: hay que volver a probar y habilitar.
  const cambioAmbiente = c.ambiente !== undefined && c.ambiente !== (actual?.ambiente ?? "certificacion");
  if (nuevasCred || cambioAmbiente) Object.assign(fila, { probado_en: null, probado_ok: null, probado_detalle: null, emision_habilitada: false });
  const { error } = await supabaseAdmin.from("fin_dte_cuentas").upsert(fila);
  if (error) {
    if (/fin_dte_cuentas/.test(error.message)) throw new Error("Falta correr la migración supabase/fin/0016_facturacion_electronica.sql.");
    throw new Error(`No se pudo guardar la cuenta: ${error.message}`);
  }
  if (nuevasCred) await supabaseAdmin.from("fin_dte_sesion").delete().eq("clave", empresaId);
}

export async function borrarCredencialesDte(empresaId: string, quien: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("fin_dte_cuentas")
    .update({ usuario_cifrado: null, clave_cifrada: null, token_cifrado: null, emision_habilitada: false, probado_en: null, probado_ok: null, probado_detalle: null, actualizado_por: quien, actualizado_en: new Date().toISOString() })
    .eq("empresa_id", empresaId);
  if (error) throw new Error(`No se pudo quitar la cuenta: ${error.message}`);
  await supabaseAdmin.from("fin_dte_sesion").delete().eq("clave", empresaId);
}

export async function registrarPruebaDte(empresaId: string, ok: boolean, detalle: string): Promise<void> {
  await supabaseAdmin.from("fin_dte_cuentas").update({ probado_en: new Date().toISOString(), probado_ok: ok, probado_detalle: detalle.slice(0, 500) }).eq("empresa_id", empresaId);
}
