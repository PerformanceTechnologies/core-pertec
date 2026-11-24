import "server-only";
import { XMLParser } from "fast-xml-parser";

// -----------------------------------------------------------------------------
//  Lectura completa de un DTE (XML del SII) para mostrarlo como documento: encabezado, emisor, receptor, detalle,
//  totales, referencias y datos de traslado. Solo lectura, para el visor de Facturación (no valida firmas).
// -----------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  removeNSPrefix: true,
  isArray: (nombre) => ["DTE", "Documento", "Detalle", "Referencia", "DscRcgGlobal", "ImptoReten", "CdgItem", "Acteco"].includes(nombre),
});

export interface ParteDte {
  rut: string | null;
  nombre: string | null;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  correo: string | null;
  contacto: string | null;
}

export interface VistaDte {
  tipoDte: number | null;
  folio: string | null;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  formaPago: string | null;
  indTraslado: string | null;
  emisor: ParteDte;
  receptor: ParteDte;
  sucursal: string | null;
  detalle: { linea: number; codigo: string | null; nombre: string; descripcion: string | null; cantidad: number | null; unidad: string | null; precio: number | null; descuentoPct: number | null; exento: boolean; monto: number | null }[];
  descuentosGlobales: { glosa: string | null; valor: number | null; tipo: string | null }[];
  referencias: { tipo: string | null; folio: string | null; fecha: string | null; codigo: string | null; razon: string | null }[];
  totales: { neto: number | null; exento: number | null; tasaIva: number | null; iva: number | null; otros: { tipo: string | null; tasa: number | null; monto: number | null }[]; total: number | null };
  transporte: { patente: string | null; chofer: string | null; destino: string | null } | null;
}

const t = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(typeof v === "object" ? "" : v).trim();
  return s || null;
};
const n = (v: unknown): number | null => {
  const s = t(v);
  if (s === null) return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};

const FORMA_PAGO: Record<string, string> = { "1": "Contado", "2": "Crédito", "3": "Sin costo" };

/** El primer documento del XML (un EnvioDTE, un DTE suelto o un Documento), o null si no es un DTE. */
export function vistaDesdeXml(xml: string): VistaDte | null {
  let raiz: any;
  try {
    raiz = parser.parse(xml);
  } catch {
    return null;
  }
  const dtes: any[] = raiz?.EnvioDTE?.SetDTE?.DTE ?? raiz?.DTE ?? [];
  const doc: any = (Array.isArray(dtes) ? dtes[0] : dtes)?.Documento?.[0] ?? raiz?.Documento?.[0] ?? null;
  if (!doc) return null;
  const enc = doc.Encabezado ?? {};
  const id = enc.IdDoc ?? {};
  const em = enc.Emisor ?? {};
  const re = enc.Receptor ?? {};
  const to = enc.Totales ?? {};
  const tr = enc.Transporte ?? null;
  const detalle = (doc.Detalle ?? []).map((d: any, i: number) => ({
    linea: n(d.NroLinDet) ?? i + 1,
    codigo: t(d.CdgItem?.[0]?.VlrCodigo),
    nombre: t(d.NmbItem) ?? "",
    descripcion: t(d.DscItem),
    cantidad: n(d.QtyItem),
    unidad: t(d.UnmdItem),
    precio: n(d.PrcItem),
    descuentoPct: n(d.DescuentoPct),
    exento: t(d.IndExe) === "1",
    monto: n(d.MontoItem),
  }));
  return {
    tipoDte: n(id.TipoDTE),
    folio: t(id.Folio),
    fechaEmision: t(id.FchEmis),
    fechaVencimiento: t(id.FchVenc),
    formaPago: FORMA_PAGO[t(id.FmaPago) ?? ""] ?? null,
    indTraslado: t(id.IndTraslado),
    emisor: {
      rut: t(em.RUTEmisor), nombre: t(em.RznSoc) ?? t(em.RznSocEmisor), giro: t(em.GiroEmis) ?? t(em.GiroEmisor), direccion: t(em.DirOrigen), comuna: t(em.CmnaOrigen),
      ciudad: t(em.CiudadOrigen), correo: t(em.CorreoEmisor), contacto: t(em.Telefono),
    },
    receptor: {
      rut: t(re.RUTRecep), nombre: t(re.RznSocRecep), giro: t(re.GiroRecep), direccion: t(re.DirRecep), comuna: t(re.CmnaRecep), ciudad: t(re.CiudadRecep),
      correo: t(re.CorreoRecep), contacto: t(re.Contacto),
    },
    sucursal: t(em.Sucursal),
    detalle,
    descuentosGlobales: (doc.DscRcgGlobal ?? []).map((g: any) => ({ glosa: t(g.GlosaDR), valor: n(g.ValorDR), tipo: t(g.TpoValor) === "%" ? "%" : "$" })),
    referencias: (doc.Referencia ?? []).map((r: any) => ({ tipo: t(r.TpoDocRef), folio: t(r.FolioRef), fecha: t(r.FchRef), codigo: t(r.CodRef), razon: t(r.RazonRef) })),
    totales: {
      neto: n(to.MntNeto), exento: n(to.MntExe), tasaIva: n(to.TasaIVA), iva: n(to.IVA),
      otros: (to.ImptoReten ?? []).map((x: any) => ({ tipo: t(x.TipoImp), tasa: n(x.TasaImp), monto: n(x.MontoImp) })),
      total: n(to.MntTotal),
    },
    transporte: tr ? { patente: t(tr.Patente), chofer: t(tr.Chofer?.NombreChofer), destino: [t(tr.DirDest), t(tr.CmnaDest), t(tr.CiudadDest)].filter(Boolean).join(", ") || null } : null,
  };
}
