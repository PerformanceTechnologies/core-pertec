// Gestión financiera: las reglas del Excel «Finanzas PERTEC v2», escritas una sola vez.
//
// Sin "server-only" ni base: recibe filas y devuelve lo calculado. Lo usan las pantallas (vía
// lib/fin/datos.ts), el dashboard y las pruebas (scripts/probar-fin.mts), que comparan contra los
// resultados del Excel con la fecha fija 04-11-2026. La UI nunca recalcula una regla por su cuenta.
//
// Fechas como texto YYYY-MM-DD (zona America/Santiago); montos en pesos enteros.

export type Iso = string;

// -----------------------------------------------------------------------------
//  Fechas y montos
// -----------------------------------------------------------------------------

export const sumarDias = (iso: Iso, dias: number): Iso => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

export const diasEntre = (desde: Iso, hasta: Iso): number =>
  Math.round((new Date(`${hasta}T12:00:00Z`).getTime() - new Date(`${desde}T12:00:00Z`).getTime()) / 86_400_000);

/** Primer día del mes de una fecha, y de los meses siguientes. */
export const inicioDeMes = (iso: Iso, mas = 0): Iso => {
  const d = new Date(`${iso.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + mas);
  return d.toISOString().slice(0, 10);
};

export const finDeMes = (iso: Iso): Iso => sumarDias(inicioDeMes(iso, 1), -1);

/** Redondeo comercial a peso, como ROUND(x, 0) de Excel. */
export const peso = (x: number): number => Math.sign(x) * Math.round(Math.abs(x));

export const conIva = (neto: number, iva: number): number => peso(neto * (1 + iva));

// -----------------------------------------------------------------------------
//  Parámetros por empresa
// -----------------------------------------------------------------------------

export interface Parametros {
  tasaIva: number;
  toleranciaFacturaOc: number;
  plazoPagoProveedorDias: number;
  plazoAclararDias: number;
  minimoCaja: number;
  tasaMoraFactoring: number;
  plazoReclamoFacturaDias: number;
  horizonteMeses: number;
  condicionPagoDefault: number;
}

export const PARAMETROS_DEFAULT: Parametros = {
  tasaIva: 0.19,
  toleranciaFacturaOc: 1000,
  plazoPagoProveedorDias: 30,
  plazoAclararDias: 3,
  minimoCaja: 20_000_000,
  tasaMoraFactoring: 0.012,
  plazoReclamoFacturaDias: 8,
  horizonteMeses: 3,
  condicionPagoDefault: 30,
};

// -----------------------------------------------------------------------------
//  Ventas: hitos facturables (hoja «Ventas y CxC»)
// -----------------------------------------------------------------------------

export type EstadoTrabajo = "pendiente" | "en_curso" | "terminado";

export const ETAPAS_HITO = [
  "Cotización enviada",
  "Por iniciar",
  "En ejecución",
  "Esperando aprobación EDP",
  "Esperando OC",
  "Esperando HES",
  "Lista para facturar",
  "Por cobrar",
  "Vencida",
  "Cobrada",
] as const;
export type EtapaHito = (typeof ETAPAS_HITO)[number];

export const ACCION_ETAPA: Record<EtapaHito, string> = {
  "Cotización enviada": "Seguimiento comercial",
  "Por iniciar": "Coordinar ejecución",
  "En ejecución": "Preparar EDP o respaldos",
  "Esperando aprobación EDP": "Perseguir aprobación del EDP",
  "Esperando OC": "Pedir OC al cliente",
  "Esperando HES": "Pedir HES al cliente",
  "Lista para facturar": "Emitir factura hoy",
  "Por cobrar": "Confirmar fecha de pago",
  Vencida: "Gestionar cobranza",
  Cobrada: "—",
};

/** Lo que trae cada hito de la base (lo MANUAL y lo HEREDA). */
export interface HitoBase {
  id: string;
  codigo: string;
  clienteId: string | null;
  proyectoId: string | null;
  descripcion: string;
  tipo: "servicio" | "arriendo" | "venta";
  periodo: string | null;
  cotizacionNumero: string | null;
  fechaAceptacion: Iso | null;
  neto: number;
  ocClienteNumero: string | null;
  estadoTrabajo: EstadoTrabajo | null;
  guiaDespacho: string | null;
  requiereEdp: boolean;
  edpFechaAprobacion: Iso | null;
  requiereHes: boolean;
  hesNumero: string | null;
  fechaEstimadaPago: Iso | null;
  condicionPagoDias: number | null;
  comentario: string | null;
  anulado: boolean;
}

/** Lo que se sabe de la factura de un hito (vía documento tributario y cobros). */
export interface FacturaDeHito {
  documentoId: string;
  folio: string;
  fechaEmision: Iso;
  /** Total de la factura que le corresponde a este hito (con IVA). */
  total: number;
  /** Lo cobrado que le corresponde (pagos + NC aplicadas). */
  pagado: number;
  fechaPagoReal: Iso | null;
  cedida: boolean;
}

export interface Hito extends HitoBase {
  totalConIva: number;
  condicion: number;
  factura: FacturaDeHito | null;
  vence: Iso | null;
  saldo: number | null;
  etapa: EtapaHito;
  accion: string;
  diasVencida: number | null;
  fechaFlujo: Iso | null;
  montoFlujo: number;
  tipoFlujo: "Por facturar" | "Facturada";
}

/** Regla G8 del Excel, en el mismo orden: la primera que se cumple manda. */
export function etapaHito(h: {
  fechaAceptacion: Iso | null;
  factura: { saldo: number; vence: Iso } | null;
  estadoTrabajo: EstadoTrabajo | null;
  requiereEdp: boolean;
  edpFechaAprobacion: Iso | null;
  ocClienteNumero: string | null;
  requiereHes: boolean;
  hesNumero: string | null;
}, hoy: Iso): EtapaHito {
  if (!h.fechaAceptacion) return "Cotización enviada";
  if (h.factura) {
    if (h.factura.saldo <= 0) return "Cobrada";
    if (hoy > h.factura.vence) return "Vencida";
    return "Por cobrar";
  }
  if (h.estadoTrabajo === "terminado") {
    if (h.requiereEdp && !h.edpFechaAprobacion) return "Esperando aprobación EDP";
    if (!h.ocClienteNumero?.trim()) return "Esperando OC";
    if (h.requiereHes && !h.hesNumero?.trim()) return "Esperando HES";
    return "Lista para facturar";
  }
  if (h.estadoTrabajo === "en_curso") return "En ejecución";
  return "Por iniciar";
}

export function calcularHito(b: HitoBase, factura: FacturaDeHito | null, condicionCliente: number | null, p: Parametros, hoy: Iso): Hito {
  const totalConIva = conIva(b.neto, p.tasaIva);
  const condicion = b.condicionPagoDias ?? condicionCliente ?? p.condicionPagoDefault;
  const vence = factura ? sumarDias(factura.fechaEmision, condicion) : null;
  const saldo = factura ? factura.total - factura.pagado : null;
  const etapa = etapaHito({ ...b, factura: factura && vence ? { saldo: saldo!, vence } : null }, hoy);
  const fechaFlujo = b.fechaAceptacion ? b.fechaEstimadaPago ?? vence : null;
  const montoFlujo = !b.fechaAceptacion || b.anulado ? 0 : !factura ? totalConIva : factura.cedida ? 0 : Math.max(0, saldo!);
  return {
    ...b,
    totalConIva,
    condicion,
    factura,
    vence,
    saldo,
    etapa,
    accion: ACCION_ETAPA[etapa],
    diasVencida: etapa === "Vencida" && vence ? diasEntre(vence, hoy) : null,
    fechaFlujo,
    montoFlujo,
    tipoFlujo: factura ? "Facturada" : "Por facturar",
  };
}

// -----------------------------------------------------------------------------
//  Compras (hoja «Compras y CxP»)
// -----------------------------------------------------------------------------

export type Recepcion = "si" | "parcial" | "no";

export interface CompraBase {
  id: string;
  codigo: string;
  proyectoId: string | null;
  proveedorId: string | null;
  descripcion: string;
  netoCotizado: number | null;
  aprobadoPor: string | null;
  fechaAprobacion: Iso | null;
  fechaVisado: Iso | null;
  ocNumero: string | null;
  recepcion: Recepcion | null;
  facturaFolio: string | null;
  facturaTotal: number | null;
  facturaVence: Iso | null;
  fechaProgramada: Iso | null;
  fechaPagoReal: Iso | null;
  comentario: string | null;
  anulada: boolean;
}

export const PASOS_COMPRA = [
  "Falta aprobación JP o gerente",
  "Falta visado de Finanzas",
  "Emitir OC al proveedor",
  "Esperar recepción conforme",
  "Esperar factura del proveedor",
  "Factura sin OC: regularizar",
  "Revisar diferencia con la OC",
  "Vencida: programar pago ya",
  "Programar pago",
  "Pago programado",
  "Pagada",
  "Anulada",
] as const;
export type PasoCompra = (typeof PASOS_COMPRA)[number];

export interface Compra extends CompraBase {
  paso: PasoCompra;
  diferenciaVsOc: number | null;
  comprometidoNeto: number;
  fechaFlujo: Iso | null;
  montoFlujo: number;
}

export function diferenciaVsOc(c: Pick<CompraBase, "facturaTotal" | "ocNumero" | "netoCotizado">, iva: number): number | null {
  if (c.facturaTotal === null || !c.ocNumero) return null;
  return c.facturaTotal - conIva(c.netoCotizado ?? 0, iva);
}

/** Regla E8 del Excel («Siguiente paso»), en el mismo orden. La diferencia con la OC va en valor absoluto. */
export function siguientePasoCompra(c: CompraBase, p: Parametros, hoy: Iso): PasoCompra {
  if (c.anulada) return "Anulada";
  if (c.fechaPagoReal) return "Pagada";
  if (c.facturaFolio && !c.ocNumero) return "Factura sin OC: regularizar";
  if (!c.aprobadoPor && !c.fechaAprobacion) return "Falta aprobación JP o gerente";
  if (!c.fechaVisado) return "Falta visado de Finanzas";
  if (!c.ocNumero) return "Emitir OC al proveedor";
  if (c.recepcion !== "si") return "Esperar recepción conforme";
  if (!c.facturaFolio) return "Esperar factura del proveedor";
  const dif = diferenciaVsOc(c, p.tasaIva);
  if (dif !== null && Math.abs(dif) > p.toleranciaFacturaOc) return "Revisar diferencia con la OC";
  if (!c.fechaProgramada) return c.facturaVence && hoy > c.facturaVence ? "Vencida: programar pago ya" : "Programar pago";
  return "Pago programado";
}

export function calcularCompra(c: CompraBase, p: Parametros, hoy: Iso): Compra {
  const pagada = Boolean(c.fechaPagoReal) || c.anulada;
  const comprometidoNeto = c.anulada ? 0 : c.facturaTotal !== null ? peso(c.facturaTotal / (1 + p.tasaIva)) : c.fechaVisado ? c.netoCotizado ?? 0 : 0;
  const fechaFlujo = pagada ? null : c.fechaProgramada ?? c.facturaVence ?? (c.fechaVisado ? sumarDias(c.fechaVisado, p.plazoPagoProveedorDias) : null);
  const montoFlujo = pagada ? 0 : c.facturaTotal ?? (c.fechaVisado ? conIva(c.netoCotizado ?? 0, p.tasaIva) : 0);
  return { ...c, paso: siguientePasoCompra(c, p, hoy), diferenciaVsOc: diferenciaVsOc(c, p.tasaIva), comprometidoNeto, fechaFlujo, montoFlujo };
}

// -----------------------------------------------------------------------------
//  Factoring (hoja «Factoring»)
// -----------------------------------------------------------------------------

export interface CesionBase {
  id: string;
  operacionId: string;
  operacionNumero: string;
  factorNombre: string;
  recurso: "con" | "sin";
  fechaCesion: Iso;
  documentoId: string;
  folio: string;
  clienteId: string | null;
  nominal: number;
  pctAnticipo: number;
  costoFactor: number;
  fechaAnticipo: Iso | null;
  vence: Iso | null;
  fechaEstimadaPago: Iso | null;
  fechaPagoReal: Iso | null;
  factorConfirmaFecha: Iso | null;
  moraCobrada: number | null;
  excedenteRecibidoFecha: Iso | null;
  tasaMora: number;
}

export const ESTADOS_FACTORING = ["Vigente", "En mora: cobrar al cliente", "Cliente pagó: confirmar con el factor", "Esperando excedente", "Liquidada"] as const;
export type EstadoFactoring = (typeof ESTADOS_FACTORING)[number];

export interface Cesion extends CesionBase {
  anticipo: number;
  netoRecibido: number;
  diasMora: number;
  moraEstimada: number;
  excedenteEsperado: number;
  estado: EstadoFactoring;
  fechaFlujo: Iso | null;
  montoFlujo: number;
}

export function calcularCesion(c: CesionBase, hoy: Iso): Cesion {
  const anticipo = peso(c.nominal * c.pctAnticipo);
  const diasMora = c.vence ? Math.max(0, diasEntre(c.vence, c.fechaPagoReal ?? hoy)) : 0;
  const moraEstimada = peso(anticipo * c.tasaMora * diasMora / 30);
  const excedenteEsperado = c.nominal - anticipo - (c.moraCobrada ?? moraEstimada);
  let estado: EstadoFactoring;
  if (c.excedenteRecibidoFecha) estado = "Liquidada";
  else if (c.fechaPagoReal && !c.factorConfirmaFecha) estado = "Cliente pagó: confirmar con el factor";
  else if (c.fechaPagoReal) estado = "Esperando excedente";
  else if (diasMora > 0) estado = "En mora: cobrar al cliente";
  else estado = "Vigente";
  const liquidada = estado === "Liquidada";
  return {
    ...c,
    anticipo,
    netoRecibido: anticipo - c.costoFactor,
    diasMora,
    moraEstimada,
    excedenteEsperado,
    estado,
    fechaFlujo: liquidada ? null : c.fechaPagoReal ?? c.fechaEstimadaPago ?? c.vence,
    montoFlujo: liquidada ? 0 : Math.max(0, excedenteEsperado),
  };
}

// -----------------------------------------------------------------------------
//  Banco diario
// -----------------------------------------------------------------------------

export interface MovimientoBase {
  id: string;
  cuentaId: string;
  fecha: Iso;
  glosa: string;
  monto: number;
  categoriaId: string | null;
  proyectoId: string | null;
  responsable: string | null;
  tieneRespaldo: boolean;
  documentoRef: string | null;
  conciliaciones: number;
  comentario: string | null;
}

export type EstadoMovimiento = "Por aclarar" | "Conciliado" | "Conciliado con documento";

export interface Movimiento extends MovimientoBase {
  estado: EstadoMovimiento;
  diasSinAclarar: number | null;
  escalar: boolean;
}

export function calcularMovimiento(m: MovimientoBase, p: Parametros, hoy: Iso): Movimiento {
  const conciliado = Boolean(m.categoriaId) && m.tieneRespaldo;
  const estado: EstadoMovimiento = conciliado ? (m.conciliaciones > 0 ? "Conciliado con documento" : "Conciliado") : "Por aclarar";
  const dias = estado === "Por aclarar" ? diasEntre(m.fecha, hoy) : null;
  return { ...m, estado, diasSinAclarar: dias, escalar: dias !== null && dias > p.plazoAclararDias };
}

/** La regla de categorización que calza con un movimiento (la de menor prioridad primero). */
export interface ReglaCategoria {
  id: string;
  cuentaId: string | null;
  patron: string;
  montoMin: number | null;
  montoMax: number | null;
  categoriaId: string;
  proyectoId: string | null;
  prioridad: number;
  activa: boolean;
}

export function reglaQueCalza(m: Pick<MovimientoBase, "glosa" | "monto" | "cuentaId">, reglas: ReglaCategoria[]): ReglaCategoria | null {
  const glosa = m.glosa.toLowerCase();
  return (
    [...reglas]
      .filter((r) => r.activa)
      .sort((a, b) => a.prioridad - b.prioridad)
      .find(
        (r) =>
          (!r.cuentaId || r.cuentaId === m.cuentaId) &&
          r.patron.trim() !== "" &&
          glosa.includes(r.patron.trim().toLowerCase()) &&
          (r.montoMin === null || m.monto >= r.montoMin) &&
          (r.montoMax === null || m.monto <= r.montoMax),
      ) ?? null
  );
}

/** Huella para no importar dos veces la misma línea de cartola. */
export function huellaMovimiento(cuentaId: string, fecha: Iso, monto: number, glosa: string, documento: string | null): string {
  return [cuentaId, fecha, Math.round(monto), glosa.trim().toLowerCase().replace(/\s+/g, " "), (documento ?? "").trim()].join("|");
}

// -----------------------------------------------------------------------------
//  Proyectos (hoja «Proyectos»)
// -----------------------------------------------------------------------------

export interface ProyectoBase {
  id: string;
  codigo: string;
  nombre: string;
  mandanteId: string | null;
  tipo: "contrato" | "spot" | "arriendo" | "interno";
  jefeProyecto: string | null;
  presupuestoCostos: number | null;
  estado: "activo" | "cerrado";
}

export interface CifrasProyecto {
  vendido: number;
  facturado: number;
  porFacturar: number;
  porCobrar: number;
  comprometido: number;
  disponible: number | null;
  margen: number;
  margenPct: number | null;
}

export function cifrasProyecto(pr: ProyectoBase, hitos: Hito[], compras: Compra[]): CifrasProyecto {
  const hs = hitos.filter((h) => h.proyectoId === pr.id && !h.anulado);
  const vendido = hs.filter((h) => h.fechaAceptacion).reduce((s, h) => s + h.neto, 0);
  const facturado = hs.filter((h) => h.factura).reduce((s, h) => s + h.neto, 0);
  const porCobrar = hs.reduce((s, h) => s + (h.saldo ?? 0), 0);
  const comprometido = compras.filter((c) => c.proyectoId === pr.id).reduce((s, c) => s + c.comprometidoNeto, 0);
  const margen = vendido - comprometido;
  return {
    vendido,
    facturado,
    porFacturar: vendido - facturado,
    porCobrar,
    comprometido,
    disponible: pr.presupuestoCostos === null ? null : pr.presupuestoCostos - comprometido,
    margen,
    margenPct: vendido === 0 ? null : margen / vendido,
  };
}

// -----------------------------------------------------------------------------
//  Flujo de caja (hoja «Flujo de caja»)
// -----------------------------------------------------------------------------

export const CONCEPTOS_MANUALES = [
  { clave: "anticipos_factoring", etiqueta: "Anticipos de factoring planificados", signo: 1 },
  { clave: "otros_ingresos", etiqueta: "Otros ingresos", signo: 1 },
  { clave: "remuneraciones", etiqueta: "Remuneraciones", signo: -1 },
  { clave: "impuestos", etiqueta: "Impuestos (IVA, PPM, retenciones)", signo: -1 },
  { clave: "creditos_leasing", etiqueta: "Créditos, leasing y otros", signo: -1 },
  { clave: "pago_tarjeta", etiqueta: "Pago tarjeta de crédito (meses 2 en adelante)", signo: -1 },
] as const;
export type ConceptoManual = (typeof CONCEPTOS_MANUALES)[number]["clave"];

export interface PartidaManual {
  mes: Iso;
  concepto: ConceptoManual;
  monto: number;
}

export interface MesFlujo {
  mes: Iso;
  cajaInicio: number;
  cobrosFacturadas: number;
  cobrosPorFacturar: number;
  excedentesFactoring: number;
  anticiposFactoring: number;
  otrosIngresos: number;
  totalEntradas: number;
  pagosProveedores: number;
  remuneraciones: number;
  impuestos: number;
  creditos: number;
  pagoTarjeta: number;
  totalSalidas: number;
  cajaFinal: number;
  minimo: number;
  holgura: number;
  alerta: "OK" | "FALTA CAJA";
}

export interface Flujo {
  meses: MesFlujo[];
  porFacturarSinFecha: number;
  comprasSinVisar: number;
}

/**
 * La proyección mes a mes. Mes 1 parte con la caja real de hoy e incluye lo atrasado; el pago de
 * tarjeta del mes 1 es la deuda actual, y en los meses siguientes es la estimación manual.
 */
export function calcularFlujo(d: {
  hoy: Iso;
  cajaBancos: number;
  deudaTarjeta: number;
  hitos: Hito[];
  compras: Compra[];
  cesiones: Cesion[];
  partidas: PartidaManual[];
  p: Parametros;
}): Flujo {
  const n = Math.max(1, d.p.horizonteMeses);
  const meses = Array.from({ length: n }, (_, i) => inicioDeMes(d.hoy, i));
  const enMes = (fecha: Iso | null, i: number) => {
    if (!fecha) return false;
    const fin = finDeMes(meses[i]);
    return i === 0 ? fecha <= fin : fecha >= meses[i] && fecha <= fin;
  };
  const manual = (c: ConceptoManual, i: number) => d.partidas.filter((x) => x.concepto === c && x.mes.slice(0, 7) === meses[i].slice(0, 7)).reduce((s, x) => s + x.monto, 0);

  const salida: MesFlujo[] = [];
  let caja = d.cajaBancos;
  for (let i = 0; i < n; i++) {
    const cobrosFacturadas = d.hitos.filter((h) => h.tipoFlujo === "Facturada" && enMes(h.fechaFlujo, i)).reduce((s, h) => s + h.montoFlujo, 0);
    const cobrosPorFacturar = d.hitos.filter((h) => h.tipoFlujo === "Por facturar" && enMes(h.fechaFlujo, i)).reduce((s, h) => s + h.montoFlujo, 0);
    const excedentesFactoring = d.cesiones.filter((c) => enMes(c.fechaFlujo, i)).reduce((s, c) => s + c.montoFlujo, 0);
    const anticiposFactoring = manual("anticipos_factoring", i);
    const otrosIngresos = manual("otros_ingresos", i);
    const totalEntradas = cobrosFacturadas + cobrosPorFacturar + excedentesFactoring + anticiposFactoring + otrosIngresos;
    const pagosProveedores = d.compras.filter((c) => enMes(c.fechaFlujo, i)).reduce((s, c) => s + c.montoFlujo, 0);
    const remuneraciones = manual("remuneraciones", i);
    const impuestos = manual("impuestos", i);
    const creditos = manual("creditos_leasing", i);
    const pagoTarjeta = i === 0 ? d.deudaTarjeta : manual("pago_tarjeta", i);
    const totalSalidas = pagosProveedores + remuneraciones + impuestos + creditos + pagoTarjeta;
    const cajaFinal = caja + totalEntradas - totalSalidas;
    const holgura = cajaFinal - d.p.minimoCaja;
    salida.push({
      mes: meses[i], cajaInicio: caja, cobrosFacturadas, cobrosPorFacturar, excedentesFactoring, anticiposFactoring, otrosIngresos, totalEntradas,
      pagosProveedores, remuneraciones, impuestos, creditos, pagoTarjeta, totalSalidas, cajaFinal, minimo: d.p.minimoCaja, holgura,
      alerta: holgura < 0 ? "FALTA CAJA" : "OK",
    });
    caja = cajaFinal;
  }
  return {
    meses: salida,
    porFacturarSinFecha: d.hitos.filter((h) => h.tipoFlujo === "Por facturar" && h.fechaAceptacion && !h.fechaFlujo).reduce((s, h) => s + h.montoFlujo, 0),
    comprasSinVisar: d.compras.filter((c) => !c.fechaVisado && !c.anulada && !c.fechaPagoReal && c.facturaTotal === null).reduce((s, c) => s + (c.netoCotizado ?? 0), 0),
  };
}

// -----------------------------------------------------------------------------
//  Dashboard (hoja «Dashboard»)
// -----------------------------------------------------------------------------

export interface Dashboard {
  cajaBancos: number;
  deudaTarjeta: number;
  movimientosPorAclarar: number;
  montoPorAclarar: number;
  movimientosEscalar: number;
  porCobrar: number;
  porCobrarVencido: number;
  porCobrarCedido: number;
  terminadoSinFacturar: number;
  listoParaFacturar: number;
  porPagar: number;
  porPagarVencido: number;
  porPagar30: number;
  facturasSinOc: number;
  comprasEsperandoVisado: number;
  cedidasVigentes: number;
  anticiposVigentes: number;
  facturasEnMora: number;
  moraEstimada: number;
  excedentesPorRecibir: number;
  porEtapa: { etapa: EtapaHito; n: number; monto: number }[];
  porMandante: { clienteId: string | null; terminadoSinFacturar: number; porCobrar: number; vencido: number }[];
}

const ESPERANDO: EtapaHito[] = ["Esperando aprobación EDP", "Esperando OC", "Esperando HES", "Lista para facturar"];

export function calcularDashboard(d: {
  hoy: Iso;
  cajaBancos: number;
  deudaTarjeta: number;
  hitos: Hito[];
  compras: Compra[];
  cesiones: Cesion[];
  movimientos: Movimiento[];
}): Dashboard {
  const hs = d.hitos.filter((h) => !h.anulado);
  const facturadas = hs.filter((h) => h.factura);
  const porAclarar = d.movimientos.filter((m) => m.estado === "Por aclarar");
  const conFactura = d.compras.filter((c) => !c.anulada && c.facturaTotal !== null && !c.fechaPagoReal);
  const en30 = sumarDias(d.hoy, 30);
  const vigentes = d.cesiones.filter((c) => c.estado !== "Liquidada");
  const clientes = [...new Set(hs.map((h) => h.clienteId))];
  return {
    cajaBancos: d.cajaBancos,
    deudaTarjeta: d.deudaTarjeta,
    movimientosPorAclarar: porAclarar.length,
    // Como el Excel: la suma con signo (abonos − cargos) de lo que falta aclarar.
    montoPorAclarar: porAclarar.reduce((s, m) => s + m.monto, 0),
    movimientosEscalar: d.movimientos.filter((m) => m.escalar).length,
    porCobrar: facturadas.reduce((s, h) => s + Math.max(0, h.saldo ?? 0), 0),
    porCobrarVencido: hs.filter((h) => h.etapa === "Vencida").reduce((s, h) => s + (h.saldo ?? 0), 0),
    porCobrarCedido: facturadas.filter((h) => h.factura?.cedida).reduce((s, h) => s + Math.max(0, h.saldo ?? 0), 0),
    terminadoSinFacturar: hs.filter((h) => ESPERANDO.includes(h.etapa)).reduce((s, h) => s + h.totalConIva, 0),
    listoParaFacturar: hs.filter((h) => h.etapa === "Lista para facturar").reduce((s, h) => s + h.totalConIva, 0),
    porPagar: conFactura.reduce((s, c) => s + (c.facturaTotal ?? 0), 0),
    porPagarVencido: conFactura.filter((c) => c.facturaVence && c.facturaVence < d.hoy).reduce((s, c) => s + (c.facturaTotal ?? 0), 0),
    // Como el Excel: todo lo que hay que pagar de aquí a 30 días según el flujo, incluido lo atrasado.
    porPagar30: d.compras.filter((c) => c.fechaFlujo && c.fechaFlujo <= en30).reduce((s, c) => s + c.montoFlujo, 0),
    facturasSinOc: d.compras.filter((c) => c.paso === "Factura sin OC: regularizar").length,
    comprasEsperandoVisado: d.compras.filter((c) => c.paso === "Falta visado de Finanzas").reduce((s, c) => s + (c.netoCotizado ?? 0), 0),
    cedidasVigentes: vigentes.reduce((s, c) => s + c.nominal, 0),
    anticiposVigentes: vigentes.reduce((s, c) => s + c.anticipo, 0),
    facturasEnMora: vigentes.filter((c) => c.diasMora > 0).length,
    moraEstimada: vigentes.reduce((s, c) => s + c.moraEstimada, 0),
    excedentesPorRecibir: vigentes.reduce((s, c) => s + c.montoFlujo, 0),
    porEtapa: ETAPAS_HITO.map((etapa) => {
      const xs = hs.filter((h) => h.etapa === etapa);
      return { etapa, n: xs.length, monto: xs.reduce((s, h) => s + h.totalConIva, 0) };
    }),
    porMandante: clientes.map((clienteId) => {
      const xs = hs.filter((h) => h.clienteId === clienteId);
      return {
        clienteId,
        terminadoSinFacturar: xs.filter((h) => ESPERANDO.includes(h.etapa)).reduce((s, h) => s + h.totalConIva, 0),
        porCobrar: xs.filter((h) => h.factura).reduce((s, h) => s + Math.max(0, h.saldo ?? 0), 0),
        vencido: xs.filter((h) => h.etapa === "Vencida").reduce((s, h) => s + (h.saldo ?? 0), 0),
      };
    }),
  };
}

// -----------------------------------------------------------------------------
//  Generador de hitos al aceptar una cotización
// -----------------------------------------------------------------------------

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export interface HitoGenerado {
  periodo: string;
  neto: number;
  periodoDesde: Iso | null;
  periodoHasta: Iso | null;
}

/**
 * Los hitos de una cotización aceptada: uno «Única»; N hitos que reparten el neto (el último
 * absorbe el redondeo); o uno por mes entre dos fechas («EDP oct», «Arriendo nov»).
 */
export function generarHitos(
  modo: { tipo: "unica" } | { tipo: "partes"; partes: number } | { tipo: "mensual"; desde: Iso; hasta: Iso; prefijo: string; montoMensual?: number },
  neto: number,
): HitoGenerado[] {
  if (modo.tipo === "unica") return [{ periodo: "Única", neto, periodoDesde: null, periodoHasta: null }];
  if (modo.tipo === "partes") {
    const n = Math.max(1, Math.min(60, Math.floor(modo.partes)));
    const parte = peso(neto / n);
    return Array.from({ length: n }, (_, i) => ({ periodo: `Hito ${i + 1}`, neto: i === n - 1 ? neto - parte * (n - 1) : parte, periodoDesde: null, periodoHasta: null }));
  }
  const meses: Iso[] = [];
  for (let m = inicioDeMes(modo.desde); m <= modo.hasta && meses.length < 60; m = inicioDeMes(m, 1)) meses.push(m);
  if (meses.length === 0) return [];
  const mensual = modo.montoMensual ?? peso(neto / meses.length);
  return meses.map((m, i) => ({
    periodo: `${modo.prefijo} ${MESES_CORTOS[Number(m.slice(5, 7)) - 1]}${m.slice(0, 4) !== meses[0].slice(0, 4) || m.slice(0, 4) !== meses[meses.length - 1].slice(0, 4) ? ` ${m.slice(2, 4)}` : ""}`,
    neto: modo.montoMensual ? mensual : i === meses.length - 1 ? neto - mensual * (meses.length - 1) : mensual,
    periodoDesde: m,
    periodoHasta: finDeMes(m),
  }));
}

// -----------------------------------------------------------------------------
//  RUT y formato
// -----------------------------------------------------------------------------

export function dvRut(cuerpo: number): string {
  let suma = 0, mul = 2;
  for (const d of String(cuerpo).split("").reverse()) {
    suma += Number(d) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}

export function rutValido(rut: string): boolean {
  const limpio = rut.replace(/[.\s]/g, "").toUpperCase();
  const m = limpio.match(/^(\d{1,8})-?([\dK])$/);
  return Boolean(m && dvRut(Number(m[1])) === m[2]);
}

export function clp(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

export function clpCorto(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `$${(n / 1_000_000_000).toLocaleString("es-CL", { maximumFractionDigits: 2 })} mil M`;
  if (a >= 1_000_000) return `$${(n / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M`;
  if (a >= 10_000) return `$${Math.round(n / 1000).toLocaleString("es-CL")} mil`;
  return clp(n);
}

export function fechaCl(iso: Iso | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
}

export function mesLargo(iso: Iso): string {
  return new Date(`${iso.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("es-CL", { month: "long", year: "numeric", timeZone: "UTC" });
}
