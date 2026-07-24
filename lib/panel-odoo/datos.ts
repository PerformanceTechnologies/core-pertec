import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Todo lo que lee este archivo viene de la cache en Supabase -- nunca
// consulta Odoo en vivo (ver plan: el panel siempre lee de la cache, la
// sincronizacion es un proceso aparte via cron/boton).

function inicioMesActual(): string {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
}

function hace6Meses(): string {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1).toISOString().slice(0, 10);
}

// "YYYY-MM" del mes actual (offset 0) o de N meses atras (offset negativo).
// Se usa para leer un mes puntual de un Map<mes, valor> por clave exacta, en
// vez de asumir que "la ultima entrada del array" es el mes actual -- si un
// mes no tiene movimientos todavia, esa entrada simplemente no existe en el
// Map, y asumir posicionalmente se corre y compara los meses equivocados.
function claveMes(offsetMeses: number): string {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth() + offsetMeses, 1).toISOString().slice(0, 7);
}

// ── Facturas ────────────────────────────────────────────────────────────

export interface FilaFactura {
  odoo_id: number;
  move_type: string;
  state: string;
  payment_state: string | null;
  numero: string | null;
  partner_nombre: string | null;
  fecha_factura: string | null;
  fecha_vencimiento: string | null;
  monto_total: number;
  monto_pendiente: number;
  diario: string | null;
}

export interface KpisFacturas {
  facturadoVentasMes: number;
  facturadoVentasMesAnterior: number;
  pendienteCobro: number;
  pendientePago: number;
  serieMensualVentas: { mes: string; monto: number }[];
}

export async function obtenerKpisFacturas(companyId: number): Promise<KpisFacturas> {
  const { data: ventasMes } = await supabaseAdmin
    .from("panel_odoo_facturas")
    .select("monto_total")
    .eq("company_id", companyId)
    .eq("move_type", "out_invoice")
    .eq("state", "posted")
    .gte("fecha_factura", inicioMesActual());

  const { data: pendienteCobro } = await supabaseAdmin
    .from("panel_odoo_facturas")
    .select("monto_pendiente")
    .eq("company_id", companyId)
    .eq("move_type", "out_invoice")
    .eq("state", "posted")
    .in("payment_state", ["not_paid", "partial"]);

  const { data: pendientePago } = await supabaseAdmin
    .from("panel_odoo_facturas")
    .select("monto_pendiente")
    .eq("company_id", companyId)
    .eq("move_type", "in_invoice")
    .eq("state", "posted")
    .in("payment_state", ["not_paid", "partial"]);

  const { data: ultimos6Meses } = await supabaseAdmin
    .from("panel_odoo_facturas")
    .select("fecha_factura, monto_total")
    .eq("company_id", companyId)
    .eq("move_type", "out_invoice")
    .eq("state", "posted")
    .gte("fecha_factura", hace6Meses());

  const sumar = (filas: { monto_total?: number; monto_pendiente?: number }[] | null, campo: "monto_total" | "monto_pendiente") =>
    (filas ?? []).reduce((acc, f) => acc + (f[campo] ?? 0), 0);

  const porMes = new Map<string, number>();
  for (const fila of ultimos6Meses ?? []) {
    if (!fila.fecha_factura) continue;
    const mes = fila.fecha_factura.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + fila.monto_total);
  }

  return {
    facturadoVentasMes: sumar(ventasMes, "monto_total"),
    facturadoVentasMesAnterior: porMes.get(claveMes(-1)) ?? 0,
    pendienteCobro: sumar(pendienteCobro, "monto_pendiente"),
    pendientePago: sumar(pendientePago, "monto_pendiente"),
    serieMensualVentas: Array.from(porMes.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, monto]) => ({ mes, monto })),
  };
}

export async function listarFacturasRecientes(companyId: number, limite = 5): Promise<FilaFactura[]> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_facturas")
    .select("*")
    .eq("company_id", companyId)
    .order("fecha_factura", { ascending: false, nullsFirst: false })
    .limit(limite);
  return (data ?? []) as FilaFactura[];
}

// ── Contabilidad ────────────────────────────────────────────────────────

export interface SerieMensualContabilidad {
  mes: string;
  ingreso: number;
  gasto: number;
}

export interface KpisContabilidad {
  ingresoMes: number;
  gastoMes: number;
  margenMes: number;
  margenMesAnterior: number;
  serieMensual: SerieMensualContabilidad[];
}

export async function obtenerKpisContabilidad(companyId: number): Promise<KpisContabilidad> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_contabilidad_mensual")
    .select("periodo, tipo_cuenta, monto")
    .eq("company_id", companyId)
    .in("tipo_cuenta", ["ingreso", "gasto"])
    .gte("periodo", hace6Meses())
    .order("periodo", { ascending: true });

  const porMes = new Map<string, { ingreso: number; gasto: number }>();
  for (const fila of data ?? []) {
    const mes = fila.periodo.slice(0, 7);
    const actual = porMes.get(mes) ?? { ingreso: 0, gasto: 0 };
    if (fila.tipo_cuenta === "ingreso") actual.ingreso += fila.monto;
    else actual.gasto += fila.monto;
    porMes.set(mes, actual);
  }

  const serieMensual = Array.from(porMes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({ mes, ...v }));

  const actual = porMes.get(claveMes(0)) ?? { ingreso: 0, gasto: 0 };
  const anterior = porMes.get(claveMes(-1)) ?? { ingreso: 0, gasto: 0 };
  return {
    ingresoMes: actual.ingreso,
    gastoMes: actual.gasto,
    margenMes: actual.ingreso - actual.gasto,
    margenMesAnterior: anterior.ingreso - anterior.gasto,
    serieMensual,
  };
}

// ── CRM ─────────────────────────────────────────────────────────────────

export interface FilaLead {
  odoo_id: number;
  tipo: string;
  nombre: string;
  partner_nombre: string | null;
  etapa: string | null;
  monto_esperado: number;
  probabilidad: number;
  vendedor: string | null;
  fecha_cierre_estimada: string | null;
}

export interface KpisCrm {
  oportunidadesAbiertas: number;
  montoEsperadoTotal: number;
  porEtapa: { etapa: string; cantidad: number }[];
}

export async function obtenerKpisCrm(companyId: number): Promise<KpisCrm> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_crm_leads")
    .select("etapa, monto_esperado")
    .eq("company_id", companyId)
    .eq("tipo", "opportunity");

  const filas = data ?? [];
  const porEtapaMapa = new Map<string, number>();
  for (const fila of filas) {
    const etapa = fila.etapa ?? "Sin etapa";
    porEtapaMapa.set(etapa, (porEtapaMapa.get(etapa) ?? 0) + 1);
  }

  return {
    oportunidadesAbiertas: filas.length,
    montoEsperadoTotal: filas.reduce((acc, f) => acc + (f.monto_esperado ?? 0), 0),
    porEtapa: Array.from(porEtapaMapa.entries()).map(([etapa, cantidad]) => ({ etapa, cantidad })),
  };
}

export async function listarLeadsRecientes(companyId: number, limite = 5): Promise<FilaLead[]> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_crm_leads")
    .select("*")
    .eq("company_id", companyId)
    .order("fecha_creacion", { ascending: false, nullsFirst: false })
    .limit(limite);
  return (data ?? []) as FilaLead[];
}

// ── Gastos ──────────────────────────────────────────────────────────────

export interface FilaGasto {
  odoo_id: number;
  descripcion: string | null;
  empleado: string | null;
  monto_total: number;
  estado: string;
  forma_pago: string | null;
  fecha: string | null;
}

export interface KpisGastos {
  totalMes: number;
  totalMesAnterior: number;
  pendientesAprobacion: number;
  serieMensual: { mes: string; monto: number }[];
}

export async function obtenerKpisGastos(companyId: number): Promise<KpisGastos> {
  const { data: gastosMes } = await supabaseAdmin
    .from("panel_odoo_gastos")
    .select("monto_total")
    .eq("company_id", companyId)
    .gte("fecha", inicioMesActual());

  const { data: pendientes } = await supabaseAdmin
    .from("panel_odoo_gastos")
    .select("monto_total")
    .eq("company_id", companyId)
    .in("estado", ["draft", "reported"]);

  const { data: ultimos6Meses } = await supabaseAdmin
    .from("panel_odoo_gastos")
    .select("fecha, monto_total")
    .eq("company_id", companyId)
    .gte("fecha", hace6Meses());

  const porMes = new Map<string, number>();
  for (const fila of ultimos6Meses ?? []) {
    if (!fila.fecha) continue;
    const mes = fila.fecha.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + fila.monto_total);
  }

  return {
    totalMes: (gastosMes ?? []).reduce((acc, f) => acc + f.monto_total, 0),
    totalMesAnterior: porMes.get(claveMes(-1)) ?? 0,
    pendientesAprobacion: (pendientes ?? []).length,
    serieMensual: Array.from(porMes.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, monto]) => ({ mes, monto })),
  };
}

export async function listarGastosRecientes(companyId: number, limite = 5): Promise<FilaGasto[]> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_gastos")
    .select("*")
    .eq("company_id", companyId)
    .order("fecha", { ascending: false, nullsFirst: false })
    .limit(limite);
  return (data ?? []) as FilaGasto[];
}
