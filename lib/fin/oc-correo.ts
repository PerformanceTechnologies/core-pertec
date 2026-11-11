// El correo que se propone al mandar la OC al proveedor. Sin "server-only": es texto puro, se prueba con tsx.
//
// A propósito NO lleva el detalle de los productos: ese va en el PDF adjunto. El mensaje es solo un punto de partida,
// la persona lo edita antes de enviarlo.

import { fechaCl } from "./reglas";
import { formatoMonto, totalesOc } from "./oc-modelo";
import { textoDePago, type DatosOc } from "./oc-documento";

export function asuntoDeOc(d: Pick<DatosOc, "numero" | "titulo" | "empresa">): string {
  return `Orden de compra ${d.numero ?? ""} · ${d.titulo} — ${d.empresa.nombre}`.replace(/\s+/g, " ").slice(0, 200);
}

export function mensajeDeOc(d: DatosOc, remitente: { nombre: string }): string {
  const t = totalesOc(d.lineas, d.tasaIva, d.moneda);
  const saludo = d.atencion?.trim() ? `Estimado/a ${d.atencion.trim()}:` : d.proveedor ? `Estimados de ${d.proveedor.nombre}:` : "Estimados:";
  const pago = textoDePago(d);
  const factura = d.empresa.rut ? `${d.empresa.nombre} (RUT ${d.empresa.rut})` : d.empresa.nombre;
  return [
    saludo,
    "",
    `Junto con saludar, les enviamos la orden de compra ${d.numero ?? ""} de ${d.empresa.nombre} por «${d.titulo}». El detalle de lo solicitado va en el PDF adjunto.`,
    "",
    `Valor total: ${formatoMonto(t.total, d.moneda)} (IVA incluido).`,
    ...(d.fechaRequerida ? [`Se necesita para el ${fechaCl(d.fechaRequerida)}.`] : []),
    ...(d.entregaLugar?.trim() ? [`Lugar de entrega: ${d.entregaLugar.trim()}.`] : []),
    ...(d.entregaPlazo?.trim() ? [`Plazo de entrega: ${d.entregaPlazo.trim()}.`] : []),
    ...(pago ? [`Condición de pago: ${pago}.`] : []),
    "",
    "Les pedimos confirmar la recepción y aceptación de la orden respondiendo este correo, e indicarnos si hay algún inconveniente con el plazo o los valores.",
    `Recuerden emitir la factura a nombre de ${factura} citando el N° de esta orden de compra.`,
    "",
    "Saludos cordiales,",
    remitente.nombre,
    d.empresa.nombre,
    ...(d.empresa.telefono ? [d.empresa.telefono] : []),
  ].join("\n");
}
