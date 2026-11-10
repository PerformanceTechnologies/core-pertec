// El mensaje que se propone al enviar una cotización: sale de la propia cotización y la persona lo edita
// antes de mandarlo. Sin "server-only": es texto puro, se prueba con tsx.

import { clp, fechaCl } from "./reglas";
import { totalesCotizacion } from "./modelo";
import { vigenteHasta, type DatosDocumento } from "./cotizacion-documento";

export function asuntoDeCotizacion(d: Pick<DatosDocumento, "numero" | "version" | "titulo" | "empresa">): string {
  return `Cotización ${d.numero}${d.version > 1 ? ` V${d.version}` : ""} · ${d.titulo} — ${d.empresa.nombre}`.slice(0, 200);
}

export function mensajeDeCotizacion(d: DatosDocumento): string {
  const t = totalesCotizacion(d.lineas, d.tasaIva, d.descuentoGeneral);
  const saludo = d.atencion?.trim() ? `Estimado/a ${d.atencion.trim()}:` : d.cliente ? `Estimados de ${d.cliente.nombre}:` : "Estimados:";
  const items = d.lineas.slice(0, 5).map((l) => `  • ${l.descripcion.replace(/\s+/g, " ").trim().slice(0, 110)}`);
  const resto = d.lineas.length > 5 ? [`  • … y ${d.lineas.length - 5} más (el detalle va en el PDF)`] : [];
  const pago = d.formaPago?.trim() || (d.condicionPagoDias ? `pago a ${d.condicionPagoDias} días` : null);
  return [
    saludo,
    "",
    `Junto con saludar, les envío la cotización ${d.numero}${d.version > 1 ? ` (versión ${d.version})` : ""} «${d.titulo}», que incluye:`,
    "",
    ...items,
    ...resto,
    "",
    ...(t.descuento > 0 ? [`Descuento aplicado: ${clp(t.descuento)}.`] : []),
    `Valor total: ${clp(t.total)} (IVA incluido; neto ${clp(t.neto + t.exento)}).`,
    `Vigencia: hasta el ${fechaCl(vigenteHasta(d.fecha, d.validezDias))}.`,
    ...(pago ? [`Condición de pago: ${pago}.`] : []),
    ...(d.plazoEntrega?.trim() ? [`Plazo de entrega: ${d.plazoEntrega.trim()}.`] : []),
    "",
    "Quedo atento/a a sus comentarios o cualquier ajuste que necesiten.",
    "",
    "Saludos cordiales,",
    d.emisor.nombre,
    d.empresa.nombre,
    ...(d.empresa.telefono ? [d.empresa.telefono] : []),
  ].join("\n");
}
