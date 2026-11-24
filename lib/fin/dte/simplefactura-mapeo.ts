// SimpleFactura: traducción PURA entre el documento del Core (lib/fin/dte/modelo.ts) y el JSON de su API.
// Sin red ni secretos: lo prueba `npm run probar-dte`. El cliente HTTP vive en ./simplefactura.ts.
//
// Fuente: colección Postman oficial (documentacion.simplefactura.cl) y el OpenAPI de api.simplefactura.cl.
// Los endpoints de emisión usan las etiquetas del XML del SII en PascalCase (Documento › Encabezado › IdDoc…);
// el resto de la API usa camelCase (credenciales, dteReferenciadoExterno…).

import { TIPOS_REFERENCIA, calcularTotales, descuentoLinea, estadoSiiDesde, montoLinea, type AccionRecibido, type CesionDte, type DocumentoDte, type EstadoSii } from "./modelo";
import type { Ambiente, DocumentoRecibido, EmisorDte } from "./proveedor";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 0 = certificación, 1 = producción (campo `ambiente` de las consultas). */
export const codigoAmbiente = (a: Ambiente): 0 | 1 => (a === "produccion" ? 1 : 0);

/** La sucursal va en la URL con «_» en vez de espacios («Casa Matriz» → «Casa_Matriz»). */
export const sucursalEnRuta = (s: string) => encodeURIComponent((s || "Casa Matriz").trim().replace(/\s+/g, "_"));

export interface DocumentoSimpleFactura {
  Documento: {
    Encabezado: {
      IdDoc: Record<string, any> & { TipoDTE: number; FchEmis: string };
      Emisor: Record<string, any> & { RUTEmisor: string };
      Receptor: Record<string, any> & { RUTRecep: string };
      Transporte?: Record<string, any> & { Chofer?: { RUTChofer?: string; NombreChofer?: string } };
      Totales: Record<string, any> & { MntTotal: number };
    };
    Detalle: (Record<string, any> & { NroLinDet: number; NmbItem: string; MontoItem: number })[];
    Referencia?: (Record<string, any> & { NroLinRef: number; TpoDocRef: string; FolioRef: string })[];
    DscRcgGlobal?: Record<string, any>[];
  };
  Observaciones?: string;
}

/** Quita las llaves con undefined/null/"" (SimpleFactura valida largos y formatos de lo que viene, aunque sea vacío). */
function limpio<T extends Record<string, any>>(o: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") out[k] = v;
  return out as T;
}

/** El cuerpo de POST /invoiceV2/{sucursal} (33, 34, 52) o /invoiceCreditDebitNotesV2/{sucursal}/{motivo} (56, 61). */
export function armarDocumentoSimpleFactura(emisor: EmisorDte, doc: DocumentoDte, tasaIva: number): DocumentoSimpleFactura {
  const tot = calcularTotales(doc, tasaIva);
  const t = doc.tipo;
  const exentaEntera = t === 34;

  const idDoc = limpio({
    TipoDTE: t,
    FchEmis: doc.fechaEmision,
    FchVenc: doc.fechaVencimiento ?? undefined,
    // La guía de un traslado que no es venta no lleva forma de pago.
    FmaPago: t === 52 ? (doc.indTraslado === 1 ? 1 : undefined) : doc.formaPago ?? 2,
    TipoDespacho: t === 52 ? doc.tipoDespacho ?? undefined : undefined,
    IndTraslado: t === 52 ? doc.indTraslado ?? undefined : undefined,
  });

  const emisorJson = limpio({
    RUTEmisor: emisor.rut,
    RznSoc: emisor.razonSocial,
    GiroEmis: emisor.giro?.slice(0, 80),
    Telefono: emisor.telefono ? [emisor.telefono.slice(0, 20)] : undefined,
    CorreoEmisor: emisor.correo ?? undefined,
    Acteco: emisor.acteco ? [emisor.acteco] : undefined,
    DirOrigen: emisor.direccion?.slice(0, 70),
    CmnaOrigen: emisor.comuna?.slice(0, 20),
    CiudadOrigen: emisor.ciudad?.slice(0, 20),
  });

  const r = doc.receptor;
  const receptor = limpio({
    RUTRecep: r.rut,
    RznSocRecep: r.razonSocial.slice(0, 100),
    GiroRecep: r.giro?.slice(0, 40),
    Contacto: r.contacto?.slice(0, 80),
    CorreoRecep: r.correo?.slice(0, 80),
    DirRecep: r.direccion?.slice(0, 70),
    CmnaRecep: r.comuna?.slice(0, 20),
    CiudadRecep: r.ciudad?.slice(0, 20),
  });

  const tr = t === 52 ? doc.transporte : null;
  const transporte = tr
    ? limpio({
        Patente: tr.patente ?? undefined,
        RUTTrans: tr.rutTransportista ?? undefined,
        Chofer: tr.rutChofer || tr.nombreChofer ? limpio({ RUTChofer: tr.rutChofer ?? undefined, NombreChofer: tr.nombreChofer ?? undefined }) : undefined,
        DirDest: tr.direccionDestino ?? undefined,
        CmnaDest: tr.comunaDestino ?? undefined,
        CiudadDest: tr.ciudadDestino ?? undefined,
      })
    : undefined;

  const totales = exentaEntera
    ? { MntExe: tot.exento, MntTotal: tot.total }
    : limpio({ MntNeto: tot.neto, MntExe: tot.exento || undefined, TasaIVA: Math.round(tasaIva * 100), IVA: tot.iva, MntTotal: tot.total });

  const detalle = doc.lineas.map((l, i) =>
    limpio({
      NroLinDet: i + 1,
      CdgItem: l.codigo ? [{ TpoCodigo: "INT1", VlrCodigo: l.codigo }] : undefined,
      NmbItem: l.nombre,
      DscItem: l.descripcion ?? undefined,
      QtyItem: l.cantidad,
      UnmdItem: l.unidad ?? undefined,
      PrcItem: l.precio,
      DescuentoPct: l.descuentoPct > 0 ? l.descuentoPct : undefined,
      DescuentoMonto: l.descuentoPct > 0 ? descuentoLinea(l) : undefined,
      IndExe: exentaEntera || l.exento ? 1 : undefined,
      MontoItem: montoLinea(l),
    }) as DocumentoSimpleFactura["Documento"]["Detalle"][number],
  );

  const referencia = doc.referencias.length
    ? doc.referencias.map((x, i) =>
        limpio({
          NroLinRef: i + 1, TpoDocRef: x.tipo, FolioRef: x.folio, FchRef: x.fecha, CodRef: x.codRef ?? undefined,
          // Sin razón, el PDF imprime «No Asignado»: se usa el nombre del documento («Orden de compra», «HES…»).
          // El PDF de SimpleFactura imprime «N°» como «N grados»: se escribe «Nro.».
          RazonRef: (x.razon ?? TIPOS_REFERENCIA.find((t) => t.codigo === x.tipo)?.texto ?? undefined)?.replace(/N[°º]\s*/g, "Nro. ").slice(0, 90),
        }) as NonNullable<DocumentoSimpleFactura["Documento"]["Referencia"]>[number],
      )
    : undefined;

  // Descuento global: TpoMov 1 = descuento, TpoValor 1 = porcentaje (enteros, no «D»/«%»).
  const dscRcg = !exentaEntera && doc.descuentoGlobalPct > 0 ? [{ NroLinDR: 1, TpoMov: 1, GlosaDR: "Descuento", TpoValor: 1, ValorDR: doc.descuentoGlobalPct }] : undefined;

  return limpio({
    Documento: limpio({
      Encabezado: limpio({ IdDoc: idDoc, Emisor: emisorJson, Receptor: receptor, Transporte: transporte, Totales: totales }),
      Detalle: detalle,
      Referencia: referencia,
      DscRcgGlobal: dscRcg,
    }),
    Observaciones: doc.observaciones ?? undefined,
  }) as DocumentoSimpleFactura;
}

/**
 * Motivo de la NC/ND (va en la URL). SimpleFactura acepta 1–6; su portal usa el mismo número del CodRef
 * (1 anula, 2 corrige texto, 3 corrige montos), que es lo que se manda aquí. Sin CodRef: 6 «Otros».
 */
export function motivoNota(doc: DocumentoDte): number {
  const c = doc.referencias.find((r) => r.codRef)?.codRef;
  return c ?? 6;
}

/** El cuerpo de POST /cederFactura (cesionario y persona autorizada ya registrados en SimpleFactura). */
export function armarCesionSimpleFactura(emisor: EmisorDte, c: CesionDte) {
  return limpio({
    RutEmpresa: emisor.rut,
    Folio: Number(c.folio),
    RutCesionario: c.cesionarioRut,
    RutPersonaAutorizada: c.personaAutorizada.rut,
    CorreoDeudor: c.correoDeudor,
    OtrasCondiciones: c.otrasCondiciones ?? undefined,
  });
}

/** Acuse o reclamo: respuesta 3 aceptado, 5 rechazado; tipoRechazo 1 contenido, 3 falta parcial, 4 falta total. */
export function respuestaAcuse(accion: AccionRecibido): { respuesta: number; tipoRechazo: number | null } {
  switch (accion) {
    case "ACD":
      return { respuesta: 3, tipoRechazo: null };
    case "RCD":
      return { respuesta: 5, tipoRechazo: 1 };
    case "RFP":
      return { respuesta: 5, tipoRechazo: 3 };
    case "RFT":
      return { respuesta: 5, tipoRechazo: 4 };
    default:
      throw new Error("SimpleFactura no expone el acuse de recibo de mercaderías (ERM): regístralo directo en el SII.");
  }
}

/** «30-03-2023» o «2023-03-30T…» → «2023-03-30». null si no se entiende. */
export function fechaSf(v: unknown): string | null {
  const s = String(v ?? "").trim();
  let m = /^(\d{2})-(\d{2})-(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

const num = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x) : 0;
};

/** Lo que SimpleFactura informa como respuesta ya dada al documento recibido. */
function accionDesde(respuesta: unknown, estadoSii: unknown): AccionRecibido | null {
  const s = `${respuesta ?? ""} ${estadoSii ?? ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/falta total/.test(s)) return "RFT";
  if (/falta parcial/.test(s)) return "RFP";
  if (/rechaz|reclamo/.test(s)) return "RCD";
  if (/acept|contado/.test(s)) return "ACD";
  return null;
}

/** Una fila de POST /documentsReceived → DocumentoRecibido. Tolerante: los ejemplos oficiales no siempre calzan con la descripción. */
export function traducirRecibido(x: any): DocumentoRecibido | null {
  const tipo = num(x?.codigoSii ?? x?.codigoTipoDte ?? x?.tipoDte);
  const folio = x?.folio !== undefined && x?.folio !== null ? String(x.folio) : "";
  const rut = String(x?.rutProveedor ?? x?.rutEmisor ?? "").toUpperCase().replace(/\./g, "");
  if (!tipo || !folio || !rut) return null;
  return {
    tipoDte: tipo,
    folio,
    rutEmisor: rut,
    razonSocial: x?.razonSocialProveedor ?? x?.razonSocial ?? null,
    fechaEmision: fechaSf(x?.fechaEmision),
    fechaRecepcion: fechaSf(x?.fechaRecepcionSII ?? x?.fechaRecepcion) ?? null,
    neto: num(x?.neto),
    exento: num(x?.exento),
    iva: num(x?.iva),
    total: num(x?.total),
    accion: accionDesde(x?.respuesta, x?.estadoSII),
    crudo: { estado: x?.estado ?? null, respuesta: x?.respuesta ?? null, estadoSII: x?.estadoSII ?? null, cedida: x?.cedida ?? null },
  };
}

/** Estado de un emitido (POST /documentIssued) → nuestro estado. */
export function traducirEstado(data: any): { estadoSii: EstadoSii; detalle: string | null; trackId: string | null } {
  const texto = data?.estadoSII ?? data?.estadoSii ?? null;
  const acuse = data?.estadoAcuse ?? null;
  return {
    estadoSii: estadoSiiDesde(texto),
    detalle: [texto, acuse && `Acuse cliente: ${acuse}`].filter(Boolean).join(" · ") || null,
    trackId: data?.trackId ?? data?.trackID ?? data?.trackid ? String(data.trackId ?? data.trackID ?? data.trackid) : null,
  };
}

/** El mensaje legible de un error de SimpleFactura (puede venir en message, data o errors[]). */
export function mensajeError(cuerpo: any, status: number): string {
  if (typeof cuerpo === "string") return cuerpo.slice(0, 300) || `HTTP ${status}`;
  const errores = Array.isArray(cuerpo?.errors) ? cuerpo.errors.filter((e: unknown) => typeof e === "string" && e.trim()) : [];
  const partes = [errores.join(" · "), typeof cuerpo?.data === "string" ? cuerpo.data : null, cuerpo?.message].filter((x) => x && String(x).trim());
  return (partes.join(" — ") || `HTTP ${status}`).slice(0, 500);
}
