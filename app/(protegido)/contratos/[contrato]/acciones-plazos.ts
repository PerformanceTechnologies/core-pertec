"use server";


import { refrescarContrato } from "@/lib/contratos/refrescar";
import { exigirCapacidad } from "@/lib/contratos/autorizacion";
import type { EstadoForm } from "@/lib/contratos/acreditacion-modelo";
import { guardarPlazo } from "@/lib/contratos/plazos";
import { esModuloConPlazo, esModuloConResponsables, type ModuloConPlazo } from "@/lib/contratos/plazos-modelo";
import { guardarResponsablesDeModulo, idsDeResponsablesDe } from "@/lib/contratos/responsables-de-modulo";
import { invalidarMiDia } from "@/lib/contratos/mi-dia/invalidar";
import { leerFecha } from "@/lib/contratos/validar-form";

/**
 * El permiso que se exige para tocar la fecha de cada submódulo: el del PROPIO submódulo.
 * Quien tiene Logística pero no Gastos de arranque no puede fijar la fecha de Gastos
 * llamando a la acción a mano (una Server Action es un endpoint).
 *
 * «Documentos generales» no es una aplicación asignable —es una carpeta de Contrato DCH—,
 * así que su guardia es la de «contratos».
 */
const APP_DE: Record<ModuloConPlazo, string> = {
  "documentos-generales": "contratos",
  acreditacion: "acreditacion",
  "acreditacion-vehiculos": "acreditacion-vehiculos",
  logistica: "logistica",
  gastos: "gastos-arranque",
};

/**
 * Fija la fecha límite de un submódulo, o la quita si el campo viene vacío.
 *
 * La guardia va FUERA del try: exigirAccesoApp() redirige lanzando una excepción, y dentro
 * de un catch se convertiría en un mensaje de error en vez de sacar a quien no tiene acceso.
 */
export async function guardarPlazoAction(
  moduloEntrante: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  if (!esModuloConPlazo(moduloEntrante)) throw new Error("Submódulo inválido.");
  const modulo = moduloEntrante;
  const usuario = await exigirCapacidad(APP_DE[modulo], "configurar");

  try {
    await guardarPlazo({
      modulo,
      fecha: leerFecha(form.get("fecha"), "La fecha límite"),
      usuarioId: usuario.id,
      usuarioNombre: usuario.nombre || usuario.correo,
    });
    // Si se movió el plazo, a quienes responden por el módulo se les rehace el Mi Día de hoy.
    if (esModuloConResponsables(modulo)) await invalidarMiDia(await idsDeResponsablesDe(modulo));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }

  // La fecha se ve en la portada de Contrato DCH y en la cabecera del propio submódulo.
  refrescarContrato();
  return { ok: true };
}

/**
 * Deja a estas personas como responsables de un submódulo.
 *
 * Mismo guardia que la fecha límite: quien tiene el módulo puede decir quién responde por él.
 * Los responsables son quienes reciben el aviso cuando el plazo se acerca, así que quedan en su
 * Mi Día de inmediato (se invalida el de hoy).
 */
export async function guardarResponsablesAction(
  moduloEntrante: string,
  _previo: EstadoForm,
  form: FormData,
): Promise<EstadoForm> {
  if (!esModuloConResponsables(moduloEntrante)) throw new Error("Submódulo inválido.");
  const modulo = moduloEntrante;
  const usuario = await exigirCapacidad(APP_DE[modulo], "configurar");

  try {
    const ids = form.getAll("responsable").filter((v): v is string => typeof v === "string" && v !== "");
    const { afectados } = await guardarResponsablesDeModulo({ modulo, ids, asignadoPor: usuario.id });
    await invalidarMiDia(afectados);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }

  refrescarContrato();
  return { ok: true };
}
