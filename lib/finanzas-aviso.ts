import "server-only";
import { avisoDeReclamos } from "./finanzas-reclamos";
import {
  CORREO_FINANZAS,
  CORREO_PRUEBA,
  enviarCorreoDePrueba,
  enviarCorreoFinanzas,
  enviarCorreoSoporte,
} from "./notificaciones";
import type { FacturaSii } from "./sii-rcv";

/**
 * Mandar el aviso de reclamos y dejar constancia de cómo salió.
 *
 * Está acá, y no en la acción ni en el cron, porque los dos lo hacen y ya se habían
 * separado: el cron avisaba a soporte cuando el correo fallaba y la acción solo escribía
 * un console.error. Dos caminos para el mismo aviso son dos comportamientos distintos
 * según por dónde se pidió la relectura.
 */

/**
 * Lo que se guarda de un aviso. Folios y asunto, nunca el cuerpo.
 *
 * El cuerpo trae montos y razones sociales de cada factura, y ya está en el correo y en
 * la tabla: repetirlo en un registro de ejecuciones es guardar lo mismo tres veces.
 */
export interface ConstanciaDeAviso {
  folios: number[];
  destinatario: string;
  asunto: string;
  enviado: boolean;
  error?: string;
}

/**
 * Avisa si hay algo que avisar, y devuelve la constancia (o null si no había).
 *
 * NUNCA lanza: si el correo falla, la relectura no se deshace —el dato ya está guardado y
 * el panel lo muestra—. Pero el fallo tiene que quedar registrado y avisarse a quien
 * puede hacer algo, que es soporte. Un reclamo de decenas de millones que nadie ve porque
 * Graph devolvió 401 es exactamente lo que este correo existe para evitar.
 */
export async function avisarReclamos(reclamos: FacturaSii[]): Promise<ConstanciaDeAviso | null> {
  const aviso = avisoDeReclamos(reclamos);
  if (!aviso) return null;

  const base = {
    folios: reclamos.map((f) => f.folio),
    destinatario: CORREO_FINANZAS,
    asunto: aviso.asunto,
  };
  try {
    await enviarCorreoFinanzas(aviso.asunto, aviso.cuerpo);
    return { ...base, enviado: true };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error(`[finanzas] no se pudo avisar el reclamo a Finanzas: ${detalle}`);
    await enviarCorreoSoporte(
      "Panel Finanzas: se detectaron facturas reclamadas y el aviso no salió",
      `Se detectaron ${reclamos.length} factura(s) de venta reclamada(s) o rechazada(s) y ` +
        `el correo a ${CORREO_FINANZAS} no se pudo enviar.\n\nError: ${detalle}\n\n${aviso.cuerpo}`,
    ).catch(() => {});
    return { ...base, enviado: false, error: detalle };
  }
}

/**
 * El mismo aviso, a la direccion de prueba, para revisar la plantilla.
 *
 * Usa avisoDeReclamos igual que el envio real: si armara su propio texto, la prueba
 * aprobaria una plantilla y Finanzas recibiria otra. Y no avisa a soporte si falla —una
 * prueba que no sale es una prueba, no un incidente— pero devuelve el motivo.
 */
export async function avisarDePrueba(reclamos: FacturaSii[]): Promise<ConstanciaDeAviso | null> {
  const aviso = avisoDeReclamos(reclamos);
  if (!aviso) return null;

  const base = {
    folios: reclamos.map((f) => f.folio),
    destinatario: CORREO_PRUEBA,
    asunto: aviso.asunto,
  };
  try {
    await enviarCorreoDePrueba(aviso.asunto, aviso.cuerpo);
    return { ...base, enviado: true };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    return { ...base, enviado: false, error: detalle };
  }
}
