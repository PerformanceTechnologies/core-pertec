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
