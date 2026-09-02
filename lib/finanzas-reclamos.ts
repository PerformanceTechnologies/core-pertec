import type { FacturaSii } from "./sii-rcv";

/**
 * El aviso de una factura de venta reclamada.
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
    `  Reclamada:    ${factura.fechaReclamo ?? "—"}`,
    `  Monto total:  ${pesos(factura.montoTotal)}`,
    `  Neto / IVA:   ${pesos(factura.montoNeto)} / ${pesos(factura.montoIvaRecuperable)}`,
    `  Período RCV:  ${factura.periodo}`,
  ].join("\n");
}

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
  const total = reclamadas.reduce((suma, f) => suma + (f.montoTotal ?? 0), 0);
  const asunto =
    cuantas === 1
      ? `Factura de venta RECLAMADA: N° ${reclamadas[0].folio} · ${reclamadas[0].razonSocial ?? reclamadas[0].rutContraparte}`
      : `${cuantas} facturas de venta RECLAMADAS por ${pesos(total)}`;

  const cuerpo = [
    cuantas === 1
      ? "El cliente reclamó una factura de venta en el SII."
      : `Hay ${cuantas} facturas de venta reclamadas por clientes en el SII, por ${pesos(total)} en total.`,
    "",
    "Una factura reclamada no se cobra como está: hay que revisar el motivo con el cliente y",
    "corregir el documento o emitir la nota de crédito que corresponda.",
    "",
    reclamadas.map(detalle).join("\n\n"),
    "",
    "— Este aviso lo manda el Panel Finanzas cuando la sincronización con el SII detecta un",
    "reclamo NUEVO. Cada factura se avisa una sola vez.",
    "El detalle completo está en core.pertec.cl/finanzas/sii.",
  ].join("\n");

  return { asunto, cuerpo };
}
