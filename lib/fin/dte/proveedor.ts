// Facturación electrónica: el contrato que cumple cualquier proveedor de DTE (hoy SimpleFactura).
//
// El Core habla solo con esta interfaz (lib/fin/dte/servicio.ts); el adaptador traduce a la API del proveedor.
// Sin "server-only" para que las pruebas puedan usar un proveedor de mentira, pero ninguna implementación real
// se importa desde el navegador.

import type { AccionRecibido, CesionDte, DocumentoDte, EstadoSii, Iso } from "./modelo";

export type Ambiente = "certificacion" | "produccion";

/** Los datos del emisor (la empresa activa del Core) que el proveedor necesita en cada llamada. */
export interface EmisorDte {
  rut: string;
  razonSocial: string;
  giro: string | null;
  acteco: number | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  correo: string | null;
  telefono: string | null;
  /** Sucursal del proveedor (SimpleFactura la pide por nombre: «Casa Matriz» por omisión). */
  sucursal: string;
}

export interface ResultadoEmision {
  folio: string;
  trackId: string | null;
  estadoSii: EstadoSii;
  /** Lo que devolvió el proveedor, recortado (va a la base para diagnóstico). */
  crudo: unknown;
}

export interface EstadoDocumento {
  estadoSii: EstadoSii;
  detalle: string | null;
  trackId: string | null;
}

export interface DocumentoRecibido {
  tipoDte: number;
  folio: string;
  rutEmisor: string;
  razonSocial: string | null;
  fechaEmision: Iso | null;
  fechaRecepcion: string | null;
  neto: number;
  exento: number;
  iva: number;
  total: number;
  /** Respuesta ya dada en el SII, si el proveedor la informa. */
  accion: AccionRecibido | null;
  crudo: unknown;
}

export interface FoliosDisponibles {
  tipoDte: number;
  disponibles: number | null;
  detalle: string | null;
}

export interface ProveedorDte {
  readonly nombre: string;
  readonly ambiente: Ambiente;
  /** Prueba de credenciales: no emite nada. */
  probarConexion(emisor: EmisorDte): Promise<{ ok: true; detalle: string } | { ok: false; detalle: string }>;
  emitir(emisor: EmisorDte, doc: DocumentoDte, tasaIva: number): Promise<ResultadoEmision>;
  consultarEstado(emisor: EmisorDte, tipoDte: number, folio: string): Promise<EstadoDocumento>;
  pdf(emisor: EmisorDte, tipoDte: number, folio: string): Promise<Buffer>;
  xml(emisor: EmisorDte, tipoDte: number, folio: string): Promise<Buffer>;
  /** Reenvía el documento al correo del receptor. */
  enviarPorCorreo?(emisor: EmisorDte, tipoDte: number, folio: string, correos: string[]): Promise<void>;
  recibidos(emisor: EmisorDte, desde: Iso, hasta: Iso): Promise<DocumentoRecibido[]>;
  responderRecibido(emisor: EmisorDte, doc: { tipoDte: number; folio: string; rutEmisor: string }, accion: AccionRecibido, motivo: string | null): Promise<void>;
  pdfRecibido?(emisor: EmisorDte, doc: { tipoDte: number; folio: string; rutEmisor: string }): Promise<Buffer>;
  ceder(emisor: EmisorDte, cesion: CesionDte): Promise<{ trackId: string | null; crudo: unknown }>;
  folios?(emisor: EmisorDte, tipoDte: number): Promise<FoliosDisponibles>;
}

/** Error del proveedor con un código corto y un mensaje para la persona (sin datos sensibles). */
export class ErrorDte extends Error {
  constructor(
    message: string,
    readonly codigo: string,
    readonly status: number,
    /** true = el pedido pudo haber llegado al SII (timeout, 5xx): NO reintentar a ciegas; consultar primero. */
    readonly incierto = false,
  ) {
    super(message);
  }
}
