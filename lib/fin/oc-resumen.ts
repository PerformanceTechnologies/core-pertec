// El resumen de una solicitud/OC para mostrarlo en pantalla (popup del aprobador y detalle). Sin "server-only":
// es solo datos, y lo usa el componente de resumen en el navegador.

import type { LineaOc, Moneda } from "./oc-modelo";

export interface ResumenCompra {
  id: string;
  codigo: string;
  titulo: string;
  paso: string;
  /** Anulada o rechazada (el registro se conserva). */
  anulada: boolean;
  ocNumero: string | null;
  proyecto: string | null;
  solicitante: string;
  proveedor: { nombre: string; rut: string | null } | null;
  atencion: string | null;
  proveedorCorreo: string | null;
  moneda: Moneda;
  tipoCambio: number;
  tasaIva: number;
  lineas: LineaOc[];
  fechaRequerida: string | null;
  entregaLugar: string | null;
  entregaPlazo: string | null;
  formaPago: string | null;
  condicionPagoDias: number | null;
  observaciones: string | null;
  /** Quién y cuándo, para ver de un vistazo en qué punto va. */
  enviadaPor: string | null;
  enviadaEn: string | null;
  aprobadoPor: string | null;
  fechaAprobacion: string | null;
  visadoPor: string | null;
  fechaVisado: string | null;
  devuelta: { motivo: string; por: string | null; en: string | null } | null;
  motivoAnulacion: string | null;
}

/** Una solicitud pendiente de alguien, como tarjeta de Mi Día (con su resumen completo para el popup). */
export interface TarjetaAprobacion {
  id: string;
  codigo: string;
  titulo: string;
  paso: string;
  ocNumero: string | null;
  proveedor: string | null;
  solicitante: string;
  /** Ya formateado: «$1.234.567», «UF 12,30»… */
  total: string;
  /** Desde cuándo espera (ISO). */
  desde: string | null;
  resumen: ResumenCompra;
}

/** Lo que una persona tiene pendiente en Compras y pagos. */
export interface PendientesDeCompras {
  empresa: string;
  porAprobar: TarjetaAprobacion[];
  porVisar: TarjetaAprobacion[];
  /** Solicitudes suyas que le devolvieron para corregir. */
  devueltas: TarjetaAprobacion[];
  puedeAprobar: boolean;
  puedeVisar: boolean;
}
