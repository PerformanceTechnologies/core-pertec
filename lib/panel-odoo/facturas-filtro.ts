import { faltaEnElSii, hayDescuadreDeMonto, type FacturaCruzada } from "./cruce-sii";

// Filtrado, orden y totales del detalle de facturas. Todo puro y sin React
// para poder probarlo con node (ver scripts/probar-panel-odoo.mts): el
// componente solo dibuja lo que estas funciones devuelven.

export type CampoOrden = "fecha_factura" | "fecha_vencimiento" | "monto_total" | "monto_pendiente" | "partner_nombre";
export type Sentido = "asc" | "desc";

export interface Criterios {
  texto: string;
  tipo: string; // "" = todos; si no, un move_type
  estado: string; // "" = todos; ver ESTADO_FILTROS
  desde: string; // "" = sin tope (YYYY-MM-DD)
  hasta: string;
  orden: CampoOrden;
  sentido: Sentido;
}

export const CRITERIOS_INICIALES: Criterios = {
  texto: "",
  tipo: "",
  estado: "",
  desde: "",
  hasta: "",
  orden: "fecha_factura",
  sentido: "desc",
};

// Los estados que se pueden elegir. No son un solo campo: mezclan el registro del SII
// (el que manda), el state de Odoo, el pago, la cesion y el vencimiento, porque es asi
// como se pregunta por una factura ("las reclamadas", "las cedidas"), no por campo. El
// grupo es para que el desplegable las separe y no queden quince opciones sueltas.
export type GrupoDeEstado = "SII" | "Odoo" | "Pago" | "Cesión";

export const ESTADO_FILTROS: {
  valor: string;
  etiqueta: string;
  grupo: GrupoDeEstado;
  cumple: (f: FacturaCruzada, hoy: string) => boolean;
}[] = [
  { valor: "sii_reclamado", etiqueta: "Reclamada por el cliente", grupo: "SII", cumple: (f) => f.sii?.estado === "reclamado" },
  { valor: "sii_aceptado", etiqueta: "Con acuse de recibo", grupo: "SII", cumple: (f) => f.sii?.estado === "aceptado" },
  { valor: "sii_registro", etiqueta: "En registro, sin acuse", grupo: "SII", cumple: (f) => f.sii?.estado === "registro" },
  { valor: "sii_pendiente", etiqueta: "Pendiente", grupo: "SII", cumple: (f) => f.sii?.estado === "pendiente" },
  { valor: "sii_no_incluir", etiqueta: "No incluir", grupo: "SII", cumple: (f) => f.sii?.estado === "no_incluir" },
  { valor: "sin_registro", etiqueta: "No está en el registro", grupo: "SII", cumple: (f) => faltaEnElSii(f) },
  { valor: "descuadre", etiqueta: "Monto distinto al del SII", grupo: "SII", cumple: (f) => hayDescuadreDeMonto(f) },
  { valor: "posted", etiqueta: "Contabilizadas", grupo: "Odoo", cumple: (f) => f.state === "posted" },
  { valor: "draft", etiqueta: "Borrador", grupo: "Odoo", cumple: (f) => f.state === "draft" },
  { valor: "cancel", etiqueta: "Anuladas", grupo: "Odoo", cumple: (f) => f.state === "cancel" },
  {
    valor: "dte_con_problema",
    etiqueta: "DTE rechazado o con reparos",
    grupo: "Odoo",
    cumple: (f) => f.dte_estado === "rejected" || f.dte_estado === "objected",
  },
  { valor: "pagadas", etiqueta: "Pagadas", grupo: "Pago", cumple: (f) => f.payment_state === "paid" },
  {
    valor: "impagas",
    etiqueta: "Impagas o parciales",
    grupo: "Pago",
    cumple: (f) => f.payment_state === "not_paid" || f.payment_state === "partial",
  },
  { valor: "vencidas", etiqueta: "Vencidas sin pagar", grupo: "Pago", cumple: (f, hoy) => estaVencida(f, hoy) },
  { valor: "cedidas", etiqueta: "Cedidas (factoring)", grupo: "Cesión", cumple: (f) => f.cedida === "yielded" },
  { valor: "por_ceder", etiqueta: "Por ceder", grupo: "Cesión", cumple: (f) => f.cedida === "to_yield" },
];

export const GRUPOS_DE_ESTADO: GrupoDeEstado[] = ["SII", "Odoo", "Pago", "Cesión"];

export function estaVencida(f: FacturaCruzada, hoy: string): boolean {
  return f.payment_state !== "paid" && !!f.fecha_vencimiento && f.fecha_vencimiento < hoy;
}

// Dias de atraso; negativo si todavia no vence. null si no hay vencimiento.
export function diasDeAtraso(f: FacturaCruzada, hoy: string): number | null {
  if (!f.fecha_vencimiento) return null;
  const dia = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${f.fecha_vencimiento}T00:00:00Z`)) / dia);
}

function normalizar(valor: string): string {
  // Sin tildes ni mayusculas: "peñalolen" tiene que encontrar "PEÑALOLÉN".
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function textoBuscable(f: FacturaCruzada): string {
  return [
    f.numero,
    f.partner_nombre,
    f.rut_contraparte,
    f.referencia,
    f.origen,
    f.edp_nombre,
    f.hes_numero,
    f.vendedor,
    f.diario,
    f.folio === null ? null : String(f.folio),
    f.sii?.razon_social ?? null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function filtrarFacturas(facturas: FacturaCruzada[], criterios: Criterios, hoy: string): FacturaCruzada[] {
  const aguja = normalizar(criterios.texto);
  const filtroEstado = ESTADO_FILTROS.find((e) => e.valor === criterios.estado);

  return facturas.filter((f) => {
    if (aguja && !normalizar(textoBuscable(f)).includes(aguja)) return false;
    if (criterios.tipo && f.move_type !== criterios.tipo) return false;
    if (filtroEstado && !filtroEstado.cumple(f, hoy)) return false;
    // Sin fecha de factura no puede quedar dentro de un rango: si hay tope,
    // sale. Sin rango sigue apareciendo.
    if (criterios.desde && (!f.fecha_factura || f.fecha_factura < criterios.desde)) return false;
    if (criterios.hasta && (!f.fecha_factura || f.fecha_factura > criterios.hasta)) return false;
    return true;
  });
}

export function ordenarFacturas(facturas: FacturaCruzada[], campo: CampoOrden, sentido: Sentido): FacturaCruzada[] {
  const signo = sentido === "asc" ? 1 : -1;
  // Copia: el arreglo que llega es el del servidor y ordenarlo en el lugar
  // haria que un re-render vea otro orden del que pidio.
  return [...facturas].sort((a, b) => {
    const va = a[campo];
    const vb = b[campo];
    // Los nulos siempre al final, sin importar el sentido.
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * signo;
    return String(va).localeCompare(String(vb), "es") * signo;
  });
}

export interface ResumenFacturas {
  cantidad: number;
  total: number;
  pendiente: number;
  cedidas: number;
  montoCedido: number;
  vencidas: number;
  montoVencido: number;
  sinRegistroSii: number;
  montoDistinto: number;
  reclamadasSii: number;
}

export function resumirFacturas(facturas: FacturaCruzada[], hoy: string): ResumenFacturas {
  const resumen: ResumenFacturas = {
    cantidad: facturas.length,
    total: 0,
    pendiente: 0,
    cedidas: 0,
    montoCedido: 0,
    vencidas: 0,
    montoVencido: 0,
    sinRegistroSii: 0,
    montoDistinto: 0,
    reclamadasSii: 0,
  };
  for (const f of facturas) {
    resumen.total += f.monto_total;
    resumen.pendiente += f.monto_pendiente;
    if (f.cedida === "yielded") {
      resumen.cedidas += 1;
      resumen.montoCedido += f.monto_total;
    }
    if (estaVencida(f, hoy)) {
      resumen.vencidas += 1;
      resumen.montoVencido += f.monto_pendiente;
    }
    if (faltaEnElSii(f)) resumen.sinRegistroSii += 1;
    if (hayDescuadreDeMonto(f)) resumen.montoDistinto += 1;
    if (f.sii?.estado === "reclamado") resumen.reclamadasSii += 1;
  }
  return resumen;
}

/** Hoy en Chile como YYYY-MM-DD, para comparar contra las fechas de Odoo (que son fechas, no instantes). */
export function hoyEnChileIso(ahora = new Date()): string {
  // en-CA da directo YYYY-MM-DD. Se calcula acá y no en el servidor porque el
  // detalle es un componente cliente y el usuario puede tenerlo abierto
  // cruzando la medianoche.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(ahora);
}
