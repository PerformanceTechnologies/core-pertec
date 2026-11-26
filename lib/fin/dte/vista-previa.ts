import "server-only";
import { pdfDesdeDte } from "../../dte-pdf";
import { COD_REF, FORMA_PAGO, IND_TRASLADO, TIPOS_REFERENCIA, calcularTotales, montoLinea, type DocumentoDte } from "./modelo";
import type { EmisorDte } from "./proveedor";

// -----------------------------------------------------------------------------
//  Vista previa en PDF de un borrador de documento tributario (solo servidor, solo lectura).
//
//  Un borrador no tiene folio ni timbre (los asigna el SII al emitir), así que no hay PDF «oficial» todavía: se arma
//  uno con los datos guardados del borrador, con la marca de agua BORRADOR, para revisarlo o mandarlo a revisar.
// -----------------------------------------------------------------------------

const fechaCl = (f: string | null) => (f ? f.split("-").reverse().join("-") : "-");

export async function pdfDeBorrador(doc: DocumentoDte, emisor: EmisorDte, tasaIva: number): Promise<Uint8Array> {
  const t = calcularTotales(doc, tasaIva);
  const r = doc.receptor;
  const notas: string[] = [];

  if (doc.tipo === 52) {
    const motivo = IND_TRASLADO.find((x) => x.codigo === doc.indTraslado)?.texto;
    if (motivo) notas.push(`Motivo del traslado: ${motivo}`);
    const tr = doc.transporte;
    const destino = [tr?.direccionDestino, tr?.comunaDestino, tr?.ciudadDestino].filter(Boolean).join(", ");
    if (destino) notas.push(`Destino: ${destino}`);
    const transporte = [tr?.patente && `Patente ${tr.patente}`, tr?.nombreChofer && `Chofer ${tr.nombreChofer}`, tr?.rutChofer && `RUT ${tr.rutChofer}`, tr?.rutTransportista && `Transportista ${tr.rutTransportista}`].filter(Boolean).join(" · ");
    if (transporte) notas.push(`Transporte: ${transporte}`);
  } else {
    const forma = FORMA_PAGO.find((x) => x.codigo === doc.formaPago)?.texto;
    if (forma) notas.push(`Forma de pago: ${forma}${doc.formaPago === 2 && doc.fechaVencimiento ? ` · vence el ${fechaCl(doc.fechaVencimiento)}` : ""}`);
  }
  for (const ref of doc.referencias) {
    const tipo = TIPOS_REFERENCIA.find((x) => x.codigo === ref.tipo)?.texto ?? ref.tipo;
    const que = ref.codRef ? COD_REF.find((x) => x.codigo === ref.codRef)?.texto : null;
    notas.push(`Referencia: ${tipo} N° ${ref.folio || "-"} del ${fechaCl(ref.fecha)}${que ? ` · ${que}` : ""}${ref.razon ? ` · ${ref.razon}` : ""}`);
  }
  if (r.contacto || r.correo) notas.push(`Atención a: ${[r.contacto, r.correo].filter(Boolean).join(" · ")}`);
  if (doc.descuentoGlobalPct) notas.push(`Descuento global: ${doc.descuentoGlobalPct}% sobre lo afecto`);
  if (doc.observaciones) notas.push(`Observaciones: ${doc.observaciones}`);

  return pdfDesdeDte(
    {
      tipoDte: doc.tipo,
      folio: null,
      fechaEmision: doc.fechaEmision,
      rutReceptor: r.rut || null,
      razonSocialReceptor: r.razonSocial || null,
      montoExento: t.exento || null,
      montoNeto: doc.tipo === 34 ? null : t.neto,
      montoIva: doc.tipo === 34 ? null : t.iva,
      montoTotal: t.total,
      datos: {
        emisor: { rut: emisor.rut || null, razonSocial: emisor.razonSocial || null, giro: emisor.giro },
        receptor: { rut: r.rut || null, razonSocial: r.razonSocial || null, giro: r.giro, direccion: [r.direccion, r.comuna, r.ciudad].filter(Boolean).join(", ") || null },
        detalle: doc.lineas.map((l) => ({ nombre: l.nombre, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precio, monto: montoLinea(l) })),
      },
    },
    { borrador: true, notas },
  );
}
