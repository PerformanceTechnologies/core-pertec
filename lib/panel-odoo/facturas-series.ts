import type { FilaFactura } from "./datos";
import { estaVencida } from "./facturas-filtro";

// Las series que dibujan los gráficos del detalle de facturas. Puras y sin React (ver
// scripts/probar-panel-odoo.mts): los componentes de ApexCharts solo reciben lo que estas
// funciones devuelven, así que lo que hay que probar es esto y no el SVG.
//
// Todas trabajan sobre las facturas YA FILTRADAS: los gráficos muestran lo mismo que la
// tabla de abajo, o serían dos respuestas distintas a la misma pregunta en la misma
// pantalla.

export interface PuntoMensual {
  /** "2026-08": es la clave con la que el clic del gráfico arma el rango de fechas. */
  mes: string;
  facturado: number;
  cobrado: number;
  pendiente: number;
  cantidad: number;
}

/**
 * Facturado, cobrado y pendiente por mes, del más viejo al más nuevo y SIN huecos.
 *
 * Sin huecos importa: un mes sin facturas tiene que aparecer en cero, porque si no la
 * línea del tiempo miente uniendo julio con septiembre como si fueran contiguos.
 */
export function serieMensual(facturas: FilaFactura[]): PuntoMensual[] {
  const porMes = new Map<string, PuntoMensual>();
  for (const f of facturas) {
    if (!f.fecha_factura) continue; // sin fecha no tiene lugar en una línea de tiempo
    const mes = f.fecha_factura.slice(0, 7);
    const punto = porMes.get(mes) ?? { mes, facturado: 0, cobrado: 0, pendiente: 0, cantidad: 0 };
    punto.facturado += f.monto_total;
    punto.pendiente += f.monto_pendiente;
    punto.cobrado += f.monto_total - f.monto_pendiente;
    punto.cantidad += 1;
    porMes.set(mes, punto);
  }
  const meses = [...porMes.keys()].sort();
  if (meses.length === 0) return [];
  return mesesEntre(meses[0], meses[meses.length - 1]).map(
    (mes) => porMes.get(mes) ?? { mes, facturado: 0, cobrado: 0, pendiente: 0, cantidad: 0 },
  );
}

/** Todos los meses de un extremo al otro, inclusive. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let [anio, mes] = desde.split("-").map(Number);
  // Tope de seguridad: 600 meses son 50 años. Un dato con una fecha de 1900 no puede
  // colgar el navegador armando un millón de puntos.
  for (let i = 0; i < 600; i += 1) {
    const clave = `${anio}-${String(mes).padStart(2, "0")}`;
    meses.push(clave);
    if (clave >= hasta) break;
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return meses;
}

/** El primer y el último día de un mes "2026-08", para el filtro de fechas. */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const [anio, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

export interface Porcion {
  /** El valor del filtro que aplica el clic en la porción. */
  filtro: string;
  etiqueta: string;
  cantidad: number;
  monto: number;
}

/**
 * El reparto por estado de pago: es la torta que se quiere ver de una cartera.
 *
 * Las vencidas salen aparte de las impagas al día, aunque en Odoo las dos digan
 * "not_paid": es la distinción que importa para cobrar.
 */
export function porEstadoDePago(facturas: FilaFactura[], hoy: string): Porcion[] {
  const grupos: { filtro: string; etiqueta: string; cumple: (f: FilaFactura) => boolean }[] = [
    { filtro: "pagadas", etiqueta: "Pagadas", cumple: (f) => f.payment_state === "paid" },
    { filtro: "vencidas", etiqueta: "Vencidas", cumple: (f) => estaVencida(f, hoy) },
    {
      filtro: "impagas",
      etiqueta: "Por vencer",
      cumple: (f) => (f.payment_state === "not_paid" || f.payment_state === "partial") && !estaVencida(f, hoy),
    },
  ];
  const porciones = grupos.map((g) => {
    const suyas = facturas.filter(g.cumple);
    return {
      filtro: g.filtro,
      etiqueta: g.etiqueta,
      cantidad: suyas.length,
      monto: suyas.reduce((a, f) => a + f.monto_total, 0),
    };
  });
  // Lo que no cae en ningún grupo (reversadas, bloqueadas, en proceso de pago) se agrupa
  // en "Otros" en vez de desaparecer: una torta a la que le faltan facturas es una torta
  // que engaña.
  const contadas = porciones.reduce((a, p) => a + p.cantidad, 0);
  if (contadas < facturas.length) {
    const resto = facturas.filter((f) => !grupos.some((g) => g.cumple(f)));
    porciones.push({
      filtro: "",
      etiqueta: "Otros",
      cantidad: resto.length,
      monto: resto.reduce((a, f) => a + f.monto_total, 0),
    });
  }
  return porciones.filter((p) => p.cantidad > 0);
}

/** Cedidas al factoring y no cedidas, por monto. Solo tiene sentido en ventas. */
export function porCesion(facturas: FilaFactura[]): Porcion[] {
  const grupos: { filtro: string; etiqueta: string; cumple: (f: FilaFactura) => boolean }[] = [
    { filtro: "cedidas", etiqueta: "Cedidas", cumple: (f) => f.cedida === "yielded" },
    { filtro: "por_ceder", etiqueta: "Por ceder", cumple: (f) => f.cedida === "to_yield" },
    { filtro: "", etiqueta: "Sin ceder", cumple: (f) => !f.cedida },
  ];
  return grupos
    .map((g) => {
      const suyas = facturas.filter(g.cumple);
      return {
        filtro: g.filtro,
        etiqueta: g.etiqueta,
        cantidad: suyas.length,
        monto: suyas.reduce((a, f) => a + f.monto_total, 0),
      };
    })
    .filter((p) => p.cantidad > 0);
}

export interface Contraparte {
  nombre: string;
  monto: number;
  pendiente: number;
  cantidad: number;
}

/**
 * Las contrapartes que más pesan, de mayor a menor.
 *
 * Se ordena por monto FACTURADO y no por cantidad: diez boletas chicas no son un cliente
 * grande. Las que no tienen nombre se juntan en "(sin contraparte)" en vez de perderse.
 */
export function topContrapartes(facturas: FilaFactura[], cuantas = 8): Contraparte[] {
  const porNombre = new Map<string, Contraparte>();
  for (const f of facturas) {
    const nombre = f.partner_nombre ?? "(sin contraparte)";
    const c = porNombre.get(nombre) ?? { nombre, monto: 0, pendiente: 0, cantidad: 0 };
    c.monto += f.monto_total;
    c.pendiente += f.monto_pendiente;
    c.cantidad += 1;
    porNombre.set(nombre, c);
  }
  return [...porNombre.values()].sort((a, b) => b.monto - a.monto).slice(0, cuantas);
}

export interface TramoDeMora {
  etiqueta: string;
  /** Días de atraso que abarca; `hasta: null` es "y más". */
  desde: number;
  hasta: number | null;
  monto: number;
  cantidad: number;
}

/** Los tramos de la antigüedad de la deuda, en el orden en que se leen. */
export const TRAMOS_DE_MORA: { etiqueta: string; desde: number; hasta: number | null }[] = [
  { etiqueta: "Por vencer", desde: Number.NEGATIVE_INFINITY, hasta: 0 },
  { etiqueta: "1 a 30 días", desde: 1, hasta: 30 },
  { etiqueta: "31 a 60", desde: 31, hasta: 60 },
  { etiqueta: "61 a 90", desde: 61, hasta: 90 },
  { etiqueta: "Más de 90", desde: 91, hasta: null },
];

/**
 * El envejecimiento de lo que está sin pagar: cuánto se debe y desde cuándo.
 *
 * Solo el monto PENDIENTE, no el total: de una factura pagada a medias se debe la mitad.
 * Las pagadas y las sin vencimiento no entran.
 */
export function envejecimiento(facturas: FilaFactura[], hoy: string): TramoDeMora[] {
  const dia = 24 * 60 * 60 * 1000;
  const tramos: TramoDeMora[] = TRAMOS_DE_MORA.map((t) => ({ ...t, monto: 0, cantidad: 0 }));
  for (const f of facturas) {
    if (f.payment_state === "paid" || f.monto_pendiente <= 0 || !f.fecha_vencimiento) continue;
    const atraso = Math.round(
      (Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${f.fecha_vencimiento}T00:00:00Z`)) / dia,
    );
    const tramo = tramos.find((t) => atraso >= t.desde && (t.hasta === null || atraso <= t.hasta));
    if (!tramo) continue;
    tramo.monto += f.monto_pendiente;
    tramo.cantidad += 1;
  }
  return tramos;
}
