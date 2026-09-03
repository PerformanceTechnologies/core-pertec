import type { FacturaSii } from "./sii-rcv";

/**
 * El aviso de una factura de venta reclamada o rechazada.
 *
 * Es lo mismo, y por eso hay un solo aviso: en el SII el rechazo del receptor es uno de
 * los tres reclamos posibles (RCD, reclamo al contenido; RFP y RFT, por falta parcial o
 * total de mercaderías), no un estado aparte. Los tres significan lo mismo para Finanzas
 * y los tres tienen que avisar.
 *
 * Una factura reclamada es plata que no se va a cobrar como está: el cliente rechazó el
 * documento y hay que emitir una nota de crédito o corregirlo antes de que se venza el
 * plazo. Enterarse mirando el panel es enterarse tarde, así que va por correo a Finanzas
 * en la misma corrida que lo detecta.
 *
 * Sin "server-only" y sin nada de Graph adentro: arma el texto y nada más, así se puede
 * probar sin mandar un correo. Quien lo manda es el cron (ver enviarCorreoFinanzas).
 */

const pesos = (monto: number | null): string =>
  monto === null ? "—" : `$${Math.round(monto).toLocaleString("es-CL")}`;

const ETIQUETA_DTE: Record<number, string> = { 33: "Factura", 34: "Factura exenta" };

/** Una factura por bloque, con todo lo que hace falta para ir a buscarla al SII. */
function detalle(factura: FacturaSii): string {
  return [
    `${ETIQUETA_DTE[factura.codigoDte] ?? `DTE ${factura.codigoDte}`} N° ${factura.folio}`,
    `  Cliente:      ${factura.razonSocial ?? "(sin razón social)"} · ${factura.rutContraparte}`,
    `  Emitida:      ${factura.fechaDocto ?? "—"}`,
    `  Reclamo:      ${factura.fechaReclamo ?? "—"}`,
    `  Monto total:  ${pesos(factura.montoTotal)}`,
    `  Neto / IVA:   ${pesos(factura.montoNeto)} / ${pesos(factura.montoIvaRecuperable)}`,
    `  Período RCV:  ${factura.periodo}`,
  ].join("\n");
}

/**
 * Quien emitio las facturas que se estan avisando.
 *
 * Constante porque el RCV que lee el scraper es el de una sola empresa —la del
 * SII_RUT_EMPRESA— y el correo tiene que nombrarla. Si algun dia se sincroniza una
 * segunda, esto deja de ser una constante y sale de la factura; no antes, para no armar
 * una configuracion que hoy no tiene dos valores posibles.
 */
const EMPRESA_EMISORA = "Performance Technologies SpA";

export interface AvisoDeReclamos {
  asunto: string;
  cuerpo: string;
}

/**
 * El correo de los reclamos nuevos, o null si no hay ninguno.
 *
 * Devuelve null en vez de un texto vacío a propósito: así quien llama no puede mandar por
 * error un aviso que no dice nada, que es la forma más rápida de que se ignoren los que sí
 * importan.
 */
export function avisoDeReclamos(reclamadas: FacturaSii[]): AvisoDeReclamos | null {
  if (reclamadas.length === 0) return null;

  const cuantas = reclamadas.length;
  const una = cuantas === 1;
  const total = reclamadas.reduce((suma, f) => suma + (f.montoTotal ?? 0), 0);

  // El asunto es fijo, sin folio ni monto: es un correo formal que Finanzas puede reenviar
  // al cliente, y ahi el folio en el asunto no aporta. El precio es que dos avisos se ven
  // iguales en la bandeja, y por eso el primer parrafo dice cuantos son.
  const asunto = `Notificación de rechazo de factura${una ? "" : "s"}`;

  const cuerpo = [
    una
      ? `Se ha registrado un rechazo de factura correspondiente a ${EMPRESA_EMISORA}.`
      : `Se han registrado ${cuantas} rechazos de facturas correspondientes a ` +
        `${EMPRESA_EMISORA}, por un total de ${pesos(total)}.`,
    "",
    `Los datos ${una ? "del documento son los siguientes" : "de los documentos son los siguientes"}:`,
    "",
    reclamadas.map(detalle).join("\n\n"),
    "",
    `Agradecemos revisar los antecedentes y gestionar la regularización ${
      una ? "del documento" : "de los documentos"
    } a la brevedad.`,
    "",
    "Este es un mensaje automático. Por favor, no responder a este correo.",
  ].join("\n");

  return { asunto, cuerpo };
}
