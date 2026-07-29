import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fechaCl } from "@/lib/cotizador/formato";
import { traducir, ETAPAS_CRM, ESTADOS_FLOTA, CATEGORIAS_GASTO, ESTADOS_FONDO } from "@/lib/panel-odoo/traducciones";

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
  montoPorEtapa: { etapa: string; cantidad: number; monto: number }[];
  porVendedor: { vendedor: string; cantidad: number }[];
  montoPorVendedor: { vendedor: string; cantidad: number; monto: number }[];
}

export async function obtenerKpisCrm(companyId: number): Promise<KpisCrm> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_crm_leads")
    .select("etapa, monto_esperado, vendedor")
    .eq("company_id", companyId)
    .eq("tipo", "opportunity");

  const filas = data ?? [];
  const porEtapaMapa = new Map<string, { cantidad: number; monto: number }>();
  const porVendedorMapa = new Map<string, { cantidad: number; monto: number }>();
  for (const fila of filas) {
    const etapa = traducir(ETAPAS_CRM, fila.etapa ?? "Sin etapa");
    const actualEtapa = porEtapaMapa.get(etapa) ?? { cantidad: 0, monto: 0 };
    actualEtapa.cantidad += 1;
    actualEtapa.monto += fila.monto_esperado ?? 0;
    porEtapaMapa.set(etapa, actualEtapa);

    const vendedor = fila.vendedor ?? "Sin asignar";
    const actualVendedor = porVendedorMapa.get(vendedor) ?? { cantidad: 0, monto: 0 };
    actualVendedor.cantidad += 1;
    actualVendedor.monto += fila.monto_esperado ?? 0;
    porVendedorMapa.set(vendedor, actualVendedor);
  }

  const montoPorEtapa = Array.from(porEtapaMapa.entries())
    .map(([etapa, v]) => ({ etapa, ...v }))
    .sort((a, b) => b.monto - a.monto);

  const montoPorVendedor = Array.from(porVendedorMapa.entries())
    .map(([vendedor, v]) => ({ vendedor, ...v }))
    .sort((a, b) => b.monto - a.monto);

  return {
    oportunidadesAbiertas: filas.length,
    montoEsperadoTotal: filas.reduce((acc, f) => acc + (f.monto_esperado ?? 0), 0),
    porEtapa: montoPorEtapa.map(({ etapa, cantidad }) => ({ etapa, cantidad })),
    montoPorEtapa,
    porVendedor: montoPorVendedor.map(({ vendedor, cantidad }) => ({ vendedor, cantidad })),
    montoPorVendedor,
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
  categoria: string | null;
}

export interface GrupoMontoConDetalle {
  categoria: string;
  monto: number;
  detalle: string[];
  [key: string]: unknown;
}

export interface GrupoMontoPorEstado {
  estado: string;
  monto: number;
  detalle: string[];
  [key: string]: unknown;
}

export interface KpisGastos {
  totalMes: number;
  totalMesAnterior: number;
  pendientesAprobacion: number;
  porCategoria: GrupoMontoConDetalle[];
  // Del mes en curso, no de "los ultimos N gastos" -- a diferencia de
  // porCategoria, mostrarLeyenda no aplica aca porque puede haber muchos
  // empleados, se muestra como lista en vez de grafico (ver TarjetaGastos).
  porEmpleado: { empleado: string; monto: number }[];
  // "Entregado" a un empleado -- dinero que ya salio de la empresa como
  // fondo por rendir, se cuenta aparte de "totalMes" (que es gasto ya
  // rendido/justificado) para no duplicar el mismo peso dos veces.
  fondosEntregadosMes: number;
  // Suma de "saldo" de los fondos en estado "delivered" (entregados a un
  // empleado y todavia no rendidos ni cerrados) -- plata que sigue afuera.
  fondosSaldoDisponible: number;
  // Composicion de TODOS los fondos (no solo el mes) por estado -- para el
  // grafico combinado (total + estado) de la tarjeta.
  fondosPorEstado: GrupoMontoPorEstado[];
}

export async function obtenerKpisGastos(companyId: number): Promise<KpisGastos> {
  // Una sola consulta al mes en curso trae lo necesario para el total, el
  // desglose por categoria y el desglose por empleado -- evita repetir el
  // mismo rango de fechas en 3 queries distintas.
  const { data: gastosMes } = await supabaseAdmin
    .from("panel_odoo_gastos")
    .select("descripcion, monto_total, categoria, empleado")
    .eq("company_id", companyId)
    .gte("fecha", inicioMesActual());

  const { data: pendientes } = await supabaseAdmin
    .from("panel_odoo_gastos")
    .select("monto_total")
    .eq("company_id", companyId)
    .in("estado", ["draft", "submitted"]);

  const { data: ultimos6Meses } = await supabaseAdmin
    .from("panel_odoo_gastos")
    .select("fecha, monto_total")
    .eq("company_id", companyId)
    .gte("fecha", hace6Meses());

  // Una sola consulta a TODOS los fondos (no solo el mes, a diferencia de
  // gastosMes) -- de aca salen los 3 indicadores de fondos: entregado en el
  // mes, saldo abierto, y la composicion por estado.
  const { data: fondosTodos } = await supabaseAdmin
    .from("panel_odoo_fondos_gasto")
    .select("referencia, empleado, fecha, monto_entregado, saldo, estado")
    .eq("company_id", companyId);

  const porMes = new Map<string, number>();
  for (const fila of ultimos6Meses ?? []) {
    if (!fila.fecha) continue;
    const mes = fila.fecha.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + fila.monto_total);
  }

  const porCategoriaMapa = new Map<string, { monto: number; detalle: string[] }>();
  const porEmpleadoMapa = new Map<string, number>();
  for (const g of gastosMes ?? []) {
    const categoria = traducir(CATEGORIAS_GASTO, g.categoria ?? "Sin categoría");
    const actual = porCategoriaMapa.get(categoria) ?? { monto: 0, detalle: [] };
    actual.monto += g.monto_total;
    actual.detalle.push(g.descripcion ?? "Gasto sin descripción");
    porCategoriaMapa.set(categoria, actual);

    const empleado = g.empleado ?? "Sin asignar";
    porEmpleadoMapa.set(empleado, (porEmpleadoMapa.get(empleado) ?? 0) + g.monto_total);
  }

  const inicioMes = inicioMesActual();
  const ESTADOS_FONDO_ENTREGADO = ["delivered", "settled", "closed"];
  let fondosEntregadosMes = 0;
  let fondosSaldoDisponible = 0;
  const porEstadoFondoMapa = new Map<string, { monto: number; detalle: string[] }>();
  for (const f of fondosTodos ?? []) {
    if (ESTADOS_FONDO_ENTREGADO.includes(f.estado) && f.fecha && f.fecha >= inicioMes) {
      fondosEntregadosMes += f.monto_entregado;
    }
    if (f.estado === "delivered") {
      fondosSaldoDisponible += f.saldo;
    }
    const estado = traducir(ESTADOS_FONDO, f.estado);
    const actual = porEstadoFondoMapa.get(estado) ?? { monto: 0, detalle: [] };
    actual.monto += f.monto_entregado;
    actual.detalle.push(f.empleado ? `${f.referencia} — ${f.empleado}` : f.referencia);
    porEstadoFondoMapa.set(estado, actual);
  }

  return {
    totalMes: (gastosMes ?? []).reduce((acc, f) => acc + f.monto_total, 0),
    totalMesAnterior: porMes.get(claveMes(-1)) ?? 0,
    pendientesAprobacion: (pendientes ?? []).length,
    porCategoria: Array.from(porCategoriaMapa.entries())
      .map(([categoria, v]) => ({ categoria, ...v }))
      .sort((a, b) => b.monto - a.monto),
    porEmpleado: Array.from(porEmpleadoMapa.entries())
      .map(([empleado, monto]) => ({ empleado, monto }))
      .sort((a, b) => b.monto - a.monto),
    fondosEntregadosMes,
    fondosSaldoDisponible,
    fondosPorEstado: Array.from(porEstadoFondoMapa.entries())
      .map(([estado, v]) => ({ estado, ...v }))
      .sort((a, b) => b.monto - a.monto),
  };
}

export interface FilaFondo {
  odoo_id: number;
  referencia: string;
  empleado: string | null;
  descripcion: string | null;
  fecha: string | null;
  monto_entregado: number;
  monto_rendido: number;
  saldo: number;
  estado: string;
}

export async function listarFondosRecientes(companyId: number, limite = 10): Promise<FilaFondo[]> {
  const { data } = await supabaseAdmin
    .from("panel_odoo_fondos_gasto")
    .select("*")
    .eq("company_id", companyId)
    .order("fecha", { ascending: false, nullsFirst: false })
    .limit(limite);
  return (data ?? []) as FilaFondo[];
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

export interface GrupoConDetalle {
  etapa: string;
  cantidad: number;
  detalle: string[]; // items legibles para mostrar al pasar el mouse (nombre truncado en la UI, no aca)
  // Indice de tipo para que se acepte donde GraficoDona pide
  // Record<string, unknown>[] (dataKey/nameKey genericos leen por clave).
  [key: string]: unknown;
}

export interface KpisFlota {
  totalVehiculos: number;
  vehiculosActivos: number;
  porEstado: GrupoConDetalle[];
  documentacion: {
    vigentes: number;
    vencidas: number;
    porEstado: GrupoConDetalle[];
  };
}

export async function obtenerKpisFlota(companyId: number): Promise<KpisFlota> {
  const [{ data: vehiculosData }, { data: documentosData }] = await Promise.all([
    supabaseAdmin.from("panel_odoo_flota").select("estado, nombre, patente").eq("company_id", companyId),
    supabaseAdmin
      .from("panel_odoo_flota_documentos")
      .select("vehiculo_nombre, nombre, fecha_vencimiento")
      .eq("company_id", companyId),
  ]);

  const vehiculos = vehiculosData ?? [];
  const porEstadoMapa = new Map<string, { cantidad: number; detalle: string[] }>();
  for (const v of vehiculos) {
    const estado = traducir(ESTADOS_FLOTA, v.estado ?? "Sin estado");
    const actual = porEstadoMapa.get(estado) ?? { cantidad: 0, detalle: [] };
    actual.cantidad += 1;
    actual.detalle.push(v.patente ? `${v.nombre} (${v.patente})` : v.nombre);
    porEstadoMapa.set(estado, actual);
  }
  // "Activo" es el bucket ya traducido (ver ESTADOS_FLOTA) que representa un
  // vehiculo operando -- se lee de ahi en vez de comparar contra el valor
  // crudo de Odoo, para no duplicar la regla de mapeo en dos lugares.
  const vehiculosActivos = porEstadoMapa.get("Activo")?.cantidad ?? 0;

  // Documentos sin fecha de vencimiento cargada todavia no se pueden
  // clasificar como vigentes ni vencidos -- se excluyen del grafico en vez
  // de adivinar.
  const hoy = new Date().toISOString().slice(0, 10);
  const porEstadoDocMapa = new Map<string, { cantidad: number; detalle: string[] }>();
  let vigentes = 0;
  let vencidas = 0;
  for (const d of documentosData ?? []) {
    if (!d.fecha_vencimiento) continue;
    const vigente = d.fecha_vencimiento >= hoy;
    const estado = vigente ? "Vigente" : "Vencida";
    if (vigente) vigentes += 1;
    else vencidas += 1;

    const actual = porEstadoDocMapa.get(estado) ?? { cantidad: 0, detalle: [] };
    actual.cantidad += 1;
    actual.detalle.push(`${d.vehiculo_nombre} — ${d.nombre} (vence ${fechaCl(d.fecha_vencimiento)})`);
    porEstadoDocMapa.set(estado, actual);
  }

  return {
    totalVehiculos: vehiculos.length,
    vehiculosActivos,
    porEstado: Array.from(porEstadoMapa.entries())
      .map(([etapa, v]) => ({ etapa, ...v }))
      .sort((a, b) => b.cantidad - a.cantidad),
    documentacion: {
      vigentes,
      vencidas,
      // Orden fijo (Vencida primero, es lo que un admin quiere ver antes) en
      // vez de ordenar por cantidad -- y se omite el bucket si quedo en 0.
      porEstado: ["Vencida", "Vigente"]
        .map((etapa) => ({ etapa, ...(porEstadoDocMapa.get(etapa) ?? { cantidad: 0, detalle: [] }) }))
        .filter((g) => g.cantidad > 0),
    },
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

export interface ArriendoPorVencer {
  odoo_id: number;
  numero: string | null;
  partner_nombre: string | null;
  fecha_fin_arriendo: string;
  monto_total: number;
}

export interface KpisVentas {
  ventasMes: number;
  ventasMesAnterior: number;
  arriendosActivos: number;
  montoArriendosActivos: number;
  arriendosPorVencer: ArriendoPorVencer[];
  serieMensualVentas: { mes: string; monto: number }[];
}

const DIAS_ALERTA_ARRIENDO = 15;

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

  const hoy = new Date();
  const limiteAlerta = new Date(hoy);
  limiteAlerta.setDate(limiteAlerta.getDate() + DIAS_ALERTA_ARRIENDO);
  const { data: porVencer } = await supabaseAdmin
    .from("panel_odoo_ventas")
    .select("odoo_id, numero, partner_nombre, fecha_fin_arriendo, monto_total")
    .eq("company_id", companyId)
    .eq("es_arriendo", true)
    .eq("estado_arriendo", "confirmed")
    .not("fecha_fin_arriendo", "is", null)
    .gte("fecha_fin_arriendo", hoy.toISOString().slice(0, 10))
    .lte("fecha_fin_arriendo", limiteAlerta.toISOString().slice(0, 10))
    .order("fecha_fin_arriendo", { ascending: true });

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
    arriendosPorVencer: (porVencer ?? []) as ArriendoPorVencer[],
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
