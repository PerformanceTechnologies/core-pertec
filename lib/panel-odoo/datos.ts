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

// ── Flota ───────────────────────────────────────────────────────────────

export interface FilaVehiculo {
  odoo_id: number;
  nombre: string;
  patente: string | null;
  modelo: string | null;
  marca: string | null;
  conductor: string | null;
  estado: string | null;
  categoria: string | null;
  odometro: number | null;
}

export interface KpisFlota {
  totalVehiculos: number;
  porEstado: { etapa: string; cantidad: number }[];
}

export async function obtenerKpisFlota(companyId: number): Promise<KpisFlota> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_flota")
    .select("estado")
    .eq("company_id", companyId);

  const filas = data ?? [];
  const porEstadoMapa = new Map<string, number>();
  for (const fila of filas) {
    const estado = fila.estado ?? "Sin estado";
    porEstadoMapa.set(estado, (porEstadoMapa.get(estado) ?? 0) + 1);
  }

  return {
    totalVehiculos: filas.length,
    porEstado: Array.from(porEstadoMapa.entries()).map(([etapa, cantidad]) => ({ etapa, cantidad })),
  };
}

export async function listarVehiculosRecientes(companyId: number, limite = 5): Promise<FilaVehiculo[]> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_flota")
    .select("*")
    .eq("company_id", companyId)
    .order("nombre", { ascending: true })
    .limit(limite);
  return (data ?? []) as FilaVehiculo[];
}

// ── Proyectos (Odoo) ─────────────────────────────────────────────────────
// Sin filtro de empresa a proposito: project.project/project.task no usan
// multi-empresa en este Odoo (ver lib/panel-odoo/sincronizar-proyectos.ts).

export interface FilaTarea {
  odoo_id: number;
  proyecto_nombre: string | null;
  nombre: string;
  etapa: string | null;
  estado: string;
  fecha_limite: string | null;
  asignados: string | null;
}

export interface KpisProyectos {
  proyectosActivos: number;
  tareasAbiertas: number;
  tareasCompletadas: number;
}

const ESTADOS_TAREA_CERRADA = ["1_done", "1_canceled"];

export async function obtenerKpisProyectos(): Promise<KpisProyectos> {
  const [{ data: proyectos }, { data: tareas }] = await Promise.all([
    supabaseAdmin.from("panel_odoo_proyectos").select("activo").eq("activo", true),
    supabaseAdmin.from("panel_odoo_tareas").select("estado"),
  ]);

  const filasTareas = tareas ?? [];
  return {
    proyectosActivos: (proyectos ?? []).length,
    tareasAbiertas: filasTareas.filter((t) => !ESTADOS_TAREA_CERRADA.includes(t.estado)).length,
    tareasCompletadas: filasTareas.filter((t) => t.estado === "1_done").length,
  };
}

export async function listarTareasRecientes(limite = 5): Promise<FilaTarea[]> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_tareas")
    .select("*")
    .not("estado", "in", `(${ESTADOS_TAREA_CERRADA.join(",")})`)
    .order("fecha_limite", { ascending: true, nullsFirst: false })
    .limit(limite);
  return (data ?? []) as FilaTarea[];
}

// ── Ventas y Arriendo ────────────────────────────────────────────────────

export interface FilaVenta {
  odoo_id: number;
  numero: string | null;
  partner_nombre: string | null;
  fecha_orden: string | null;
  monto_total: number;
  estado: string;
  es_arriendo: boolean;
  estado_arriendo: string | null;
  fecha_fin_arriendo: string | null;
}

export interface KpisVentas {
  ventasMes: number;
  ventasMesAnterior: number;
  arriendosActivos: number;
  montoArriendosActivos: number;
  serieMensualVentas: { mes: string; monto: number }[];
}

export async function obtenerKpisVentas(companyId: number): Promise<KpisVentas> {
  const { data: ultimos6Meses } = await supabaseAdmin
    .from("panel_odoo_ventas")
    .select("fecha_orden, monto_total")
    .eq("company_id", companyId)
    .eq("es_arriendo", false)
    .eq("estado", "sale")
    .gte("fecha_orden", hace6Meses());

  const { data: arriendosActivos } = await supabaseAdmin
    .from("panel_odoo_ventas")
    .select("monto_total")
    .eq("company_id", companyId)
    .eq("es_arriendo", true)
    .eq("estado_arriendo", "confirmed");

  const porMes = new Map<string, number>();
  for (const fila of ultimos6Meses ?? []) {
    if (!fila.fecha_orden) continue;
    const mes = fila.fecha_orden.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + fila.monto_total);
  }

  return {
    ventasMes: porMes.get(claveMes(0)) ?? 0,
    ventasMesAnterior: porMes.get(claveMes(-1)) ?? 0,
    arriendosActivos: (arriendosActivos ?? []).length,
    montoArriendosActivos: (arriendosActivos ?? []).reduce((acc, f) => acc + f.monto_total, 0),
    serieMensualVentas: Array.from(porMes.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, monto]) => ({ mes, monto })),
  };
}

export async function listarVentasRecientes(companyId: number, limite = 5): Promise<FilaVenta[]> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_ventas")
    .select("*")
    .eq("company_id", companyId)
    .order("fecha_orden", { ascending: false, nullsFirst: false })
    .limit(limite);
  return (data ?? []) as FilaVenta[];
}

// ── Compras ─────────────────────────────────────────────────────────────

export interface FilaCompra {
  odoo_id: number;
  numero: string | null;
  partner_nombre: string | null;
  fecha_orden: string | null;
  monto_total: number;
  estado: string;
  estado_facturacion: string;
  fecha_entrega_esperada: string | null;
}

export interface KpisCompras {
  compradoMes: number;
  compradoMesAnterior: number;
  pendientesFacturar: number;
  serieMensual: { mes: string; monto: number }[];
}

export async function obtenerKpisCompras(companyId: number): Promise<KpisCompras> {
  const { data: ultimos6Meses } = await supabaseAdmin
    .from("panel_odoo_compras")
    .select("fecha_orden, monto_total")
    .eq("company_id", companyId)
    .eq("estado", "purchase")
    .gte("fecha_orden", hace6Meses());

  const { data: pendientes } = await supabaseAdmin
    .from("panel_odoo_compras")
    .select("odoo_id")
    .eq("company_id", companyId)
    .eq("estado_facturacion", "to invoice");

  const porMes = new Map<string, number>();
  for (const fila of ultimos6Meses ?? []) {
    if (!fila.fecha_orden) continue;
    const mes = fila.fecha_orden.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + fila.monto_total);
  }

  return {
    compradoMes: porMes.get(claveMes(0)) ?? 0,
    compradoMesAnterior: porMes.get(claveMes(-1)) ?? 0,
    pendientesFacturar: (pendientes ?? []).length,
    serieMensual: Array.from(porMes.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, monto]) => ({ mes, monto })),
  };
}

export async function listarComprasRecientes(companyId: number, limite = 5): Promise<FilaCompra[]> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_compras")
    .select("*")
    .eq("company_id", companyId)
    .order("fecha_orden", { ascending: false, nullsFirst: false })
    .limit(limite);
  return (data ?? []) as FilaCompra[];
}
