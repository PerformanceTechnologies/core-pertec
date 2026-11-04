// Gestión financiera: el motor de asientos (partida doble) y los reportes contables.
//
// Puro: recibe los documentos, cobros, pagos, movimientos y operaciones ya leídos y devuelve los
// asientos que les corresponden según la tabla de reglas de la especificación (sección 8.3). Los
// movimientos «Por aclarar» no generan asiento. Cada asiento cuadra (debe = haber) o no se emite.

import type { Iso } from "./reglas";

export interface LineaAsiento {
  cuenta: string;
  debe: number;
  haber: number;
  proyectoId?: string | null;
  glosa?: string;
}

export interface AsientoPropuesto {
  fecha: Iso;
  glosa: string;
  origenTipo: "factura_venta" | "factura_compra" | "nc_venta" | "nc_compra" | "cobro" | "pago" | "factoring" | "movimiento";
  origenId: string;
  lineas: LineaAsiento[];
}

export const CUENTAS = {
  bancos: "1.1.02",
  clientes: "1.1.03",
  ivaCf: "1.1.05",
  proveedores: "2.1.01",
  tarjeta: "2.1.02",
  obligacionFactoring: "2.1.03",
  ivaDf: "2.1.04",
  ventasServicios: "4.1.01",
  arriendos: "4.1.02",
  ventaProductos: "4.1.03",
  costoDirecto: "5.1.01",
  gastosGenerales: "5.3.01",
  gastoFactoring: "5.4.01",
  comisiones: "5.4.02",
} as const;

export interface EntradaContable {
  documentos: { id: string; direccion: "emitido" | "recibido"; tipoDte: number; folio: string; fechaEmision: Iso; neto: number; exento: number; iva: number; total: number; estado: string; razonSocial: string | null; tipoVenta?: string | null; proyectoId?: string | null; esGeneral?: boolean }[];
  cobros: { id: string; numero: string; fecha: Iso; monto: number; estado: string }[];
  pagos: { id: string; numero: string; fechaPago: Iso | null; monto: number; estado: string }[];
  operaciones: { id: string; numero: string; fechaAnticipo: Iso | null; fechaCesion: Iso; recurso: "con" | "sin"; anticipo: number; costo: number; nominal: number }[];
  /** Movimientos conciliados SIN documento ligado (comisiones, tarjeta, remuneraciones…), con la cuenta de su categoría. */
  movimientos: { id: string; fecha: Iso; glosa: string; monto: number; cuentaContable: string | null; esTarjeta: boolean; proyectoId: string | null; estado: string }[];
}

const cuadra = (ls: LineaAsiento[]) => ls.reduce((s, l) => s + l.debe - l.haber, 0) === 0;

export function generarAsientos(e: EntradaContable, desde: Iso, hasta: Iso): AsientoPropuesto[] {
  const enPeriodo = (f: Iso | null) => Boolean(f && f >= desde && f <= hasta);
  const salida: AsientoPropuesto[] = [];
  const agregar = (a: AsientoPropuesto) => {
    a.lineas = a.lineas.filter((l) => l.debe !== 0 || l.haber !== 0);
    if (a.lineas.length >= 2 && cuadra(a.lineas)) salida.push(a);
  };

  for (const d of e.documentos) {
    if (d.estado !== "vigente" || !enPeriodo(d.fechaEmision) || d.tipoDte === 52) continue;
    const base = d.neto + d.exento;
    if (d.direccion === "emitido") {
      const ingreso = d.tipoVenta === "arriendo" ? CUENTAS.arriendos : d.tipoVenta === "venta" ? CUENTAS.ventaProductos : CUENTAS.ventasServicios;
      const lineas: LineaAsiento[] = [
        { cuenta: CUENTAS.clientes, debe: d.total, haber: 0 },
        { cuenta: ingreso, debe: 0, haber: base, proyectoId: d.proyectoId },
        { cuenta: CUENTAS.ivaDf, debe: 0, haber: d.iva },
      ];
      const nc = d.tipoDte === 61;
      agregar({
        fecha: d.fechaEmision,
        glosa: `${nc ? "NC" : "Factura"} ${d.folio} · ${d.razonSocial ?? ""}`.trim(),
        origenTipo: nc ? "nc_venta" : "factura_venta",
        origenId: d.id,
        lineas: nc ? lineas.map((l) => ({ ...l, debe: l.haber, haber: l.debe })) : lineas,
      });
    } else {
      const gasto = d.esGeneral ? CUENTAS.gastosGenerales : CUENTAS.costoDirecto;
      const lineas: LineaAsiento[] = [
        { cuenta: gasto, debe: base, haber: 0, proyectoId: d.proyectoId },
        { cuenta: CUENTAS.ivaCf, debe: d.iva, haber: 0 },
        { cuenta: CUENTAS.proveedores, debe: 0, haber: d.total },
      ];
      const nc = d.tipoDte === 61;
      agregar({
        fecha: d.fechaEmision,
        glosa: `${nc ? "NC proveedor" : "Factura proveedor"} ${d.folio} · ${d.razonSocial ?? ""}`.trim(),
        origenTipo: nc ? "nc_compra" : "factura_compra",
        origenId: d.id,
        lineas: nc ? lineas.map((l) => ({ ...l, debe: l.haber, haber: l.debe })) : lineas,
      });
    }
  }

  for (const c of e.cobros) {
    if (c.estado === "anulado" || !enPeriodo(c.fecha)) continue;
    agregar({ fecha: c.fecha, glosa: `Cobro ${c.numero}`, origenTipo: "cobro", origenId: c.id, lineas: [{ cuenta: CUENTAS.bancos, debe: c.monto, haber: 0 }, { cuenta: CUENTAS.clientes, debe: 0, haber: c.monto }] });
  }
  for (const p of e.pagos) {
    if (p.estado !== "pagado" || !enPeriodo(p.fechaPago)) continue;
    agregar({ fecha: p.fechaPago!, glosa: `Pago ${p.numero}`, origenTipo: "pago", origenId: p.id, lineas: [{ cuenta: CUENTAS.proveedores, debe: p.monto, haber: 0 }, { cuenta: CUENTAS.bancos, debe: 0, haber: p.monto }] });
  }
  for (const o of e.operaciones) {
    const fecha = o.fechaAnticipo ?? o.fechaCesion;
    if (!enPeriodo(fecha)) continue;
    agregar({
      fecha,
      glosa: `Factoring op. ${o.numero} (${o.recurso === "con" ? "con" : "sin"} recurso)`,
      origenTipo: "factoring",
      origenId: o.id,
      lineas:
        o.recurso === "con"
          ? [
              { cuenta: CUENTAS.bancos, debe: o.anticipo - o.costo, haber: 0 },
              { cuenta: CUENTAS.gastoFactoring, debe: o.costo, haber: 0 },
              { cuenta: CUENTAS.obligacionFactoring, debe: 0, haber: o.anticipo },
            ]
          : [
              { cuenta: CUENTAS.bancos, debe: o.anticipo - o.costo, haber: 0 },
              { cuenta: CUENTAS.gastoFactoring, debe: o.costo, haber: 0 },
              { cuenta: "1.1.04", debe: o.nominal - o.anticipo, haber: 0 },
              { cuenta: CUENTAS.clientes, debe: 0, haber: o.nominal },
            ],
    });
  }
  for (const m of e.movimientos) {
    if (m.estado === "Por aclarar" || !enPeriodo(m.fecha) || !m.cuentaContable) continue;
    const contra = m.esTarjeta ? CUENTAS.tarjeta : CUENTAS.bancos;
    const monto = Math.abs(m.monto);
    agregar({
      fecha: m.fecha,
      glosa: m.glosa,
      origenTipo: "movimiento",
      origenId: m.id,
      lineas:
        m.monto < 0
          ? [{ cuenta: m.cuentaContable, debe: monto, haber: 0, proyectoId: m.proyectoId }, { cuenta: contra, debe: 0, haber: monto }]
          : [{ cuenta: contra, debe: monto, haber: 0 }, { cuenta: m.cuentaContable, debe: 0, haber: monto, proyectoId: m.proyectoId }],
    });
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export interface SaldoCuenta {
  cuenta: string;
  debe: number;
  haber: number;
  deudor: number;
  acreedor: number;
}

/** Balance de comprobación y saldos: sumas y saldos por cuenta. Debe sumar cero. */
export function balanceComprobacion(asientos: { lineas: LineaAsiento[] }[]): SaldoCuenta[] {
  const m = new Map<string, { debe: number; haber: number }>();
  for (const a of asientos) for (const l of a.lineas) {
    const x = m.get(l.cuenta) ?? { debe: 0, haber: 0 };
    x.debe += l.debe;
    x.haber += l.haber;
    m.set(l.cuenta, x);
  }
  return [...m.entries()]
    .map(([cuenta, x]) => ({ cuenta, ...x, deudor: Math.max(0, x.debe - x.haber), acreedor: Math.max(0, x.haber - x.debe) }))
    .sort((a, b) => a.cuenta.localeCompare(b.cuenta));
}

/** Estado de resultados simple: ingresos (4) − gastos (5). */
export function estadoResultados(saldos: SaldoCuenta[]): { ingresos: number; gastos: number; resultado: number } {
  const ingresos = saldos.filter((s) => s.cuenta.startsWith("4")).reduce((t, s) => t + s.haber - s.debe, 0);
  const gastos = saldos.filter((s) => s.cuenta.startsWith("5")).reduce((t, s) => t + s.debe - s.haber, 0);
  return { ingresos, gastos, resultado: ingresos - gastos };
}
