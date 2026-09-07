import type { FilaFactura } from "./datos";

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

// Los estados que se pueden elegir. No son un solo campo de Odoo: mezclan
// state, payment_state, la cesion y el vencimiento, porque es asi como se
// pregunta por una factura ("las vencidas", "las cedidas"), no por campo.
export const ESTADO_FILTROS: { valor: string; etiqueta: string; cumple: (f: FilaFactura, hoy: string) => boolean }[] = [
  { valor: "posted", etiqueta: "Contabilizadas", cumple: (f) => f.state === "posted" },
  { valor: "draft", etiqueta: "Borrador", cumple: (f) => f.state === "draft" },
  { valor: "cancel", etiqueta: "Anuladas", cumple: (f) => f.state === "cancel" },
  { valor: "pagadas", etiqueta: "Pagadas", cumple: (f) => f.payment_state === "paid" },
  {
    valor: "impagas",
    etiqueta: "Impagas o parciales",
    cumple: (f) => f.payment_state === "not_paid" || f.payment_state === "partial",
  },
  {
    valor: "vencidas",
    etiqueta: "Vencidas sin pagar",
    cumple: (f, hoy) => estaVencida(f, hoy),
  },
  { valor: "cedidas", etiqueta: "Cedidas (factoring)", cumple: (f) => f.cedida === "yielded" },
  { valor: "por_ceder", etiqueta: "Por ceder", cumple: (f) => f.cedida === "to_yield" },
  {
    valor: "reclamadas",
    etiqueta: "Reclamadas por el receptor",
    cumple: (f) => f.dte_aceptacion === "claimed",
  },
  {
    valor: "dte_con_problema",
    etiqueta: "DTE rechazado o con reparos",
    cumple: (f) => f.dte_estado === "rejected" || f.dte_estado === "objected",
  },
];

export function estaVencida(f: FilaFactura, hoy: string): boolean {
  return f.payment_state !== "paid" && !!f.fecha_vencimiento && f.fecha_vencimiento < hoy;
}

// Dias de atraso; negativo si todavia no vence. null si no hay vencimiento.
export function diasDeAtraso(f: FilaFactura, hoy: string): number | null {
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

function textoBuscable(f: FilaFactura): string {
  return [f.numero, f.partner_nombre, f.rut_contraparte, f.referencia, f.origen, f.edp_nombre, f.vendedor, f.diario]
    .filter(Boolean)
    .join(" ");
}

export function filtrarFacturas(facturas: FilaFactura[], criterios: Criterios, hoy: string): FilaFactura[] {
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

export function ordenarFacturas(facturas: FilaFactura[], campo: CampoOrden, sentido: Sentido): FilaFactura[] {
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
}

export function resumirFacturas(facturas: FilaFactura[], hoy: string): ResumenFacturas {
  const resumen: ResumenFacturas = {
    cantidad: facturas.length,
    total: 0,
    pendiente: 0,
    cedidas: 0,
    montoCedido: 0,
    vencidas: 0,
    montoVencido: 0,
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
