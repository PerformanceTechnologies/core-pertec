// Gestión financiera: las reglas contra el Excel «Finanzas PERTEC v2» (datos de ejemplo, hoy =
// 04-11-2026). Cada número esperado es el que calcula el Excel; si una regla cambia y deja de
// calzar, esto falla. Después, pruebas por rama de cada regla.
import assert from "node:assert/strict";
import {
  PARAMETROS_DEFAULT,
  calcularCesion,
  calcularCompra,
  calcularDashboard,
  calcularFlujo,
  calcularHito,
  calcularMovimiento,
  cifrasProyecto,
  etapaHito,
  generarHitos,
  huellaMovimiento,
  reglaQueCalza,
  rutValido,
  siguientePasoCompra,
  type CesionBase,
  type CompraBase,
  type FacturaDeHito,
  type HitoBase,
  type MovimientoBase,
  type PartidaManual,
  type ProyectoBase,
} from "../lib/fin/reglas";
import {
  aciertoIa,
  aplicableSola,
  categoriaDeIngreso,
  iaAplicableSola,
  proponerReglas,
  resultadoIa,
  sugerenciaDeIa,
  categoriasPara,
  esSegura,
  glosaComparable,
  resumenPorCategoria,
  sugerirClasificacion,
  type CategoriaLista,
  type Clasificado,
  type Subcategoria,
} from "../lib/fin/clasificacion";

const HOY = "2026-11-04";
const P = PARAMETROS_DEFAULT;
const CONDICION: Record<string, number> = { "Minera A": 60, "Minera B": 45, "Constructora C": 30, "Industrial D": 30 };

// ---------- Ventas y CxC (V-001 … V-011) -----------------------------------------

type FilaV = [string, string, string, string, string | null, number, string | null, "pendiente" | "en_curso" | "terminado" | null, string | null, boolean, string | null, boolean, string | null, number | null, string | null, string | null, number | null, string | null];
//            id     cliente proyecto tipo  aceptada  neto    OC            trabajo                               guía        reqEDP  EDP fecha  reqHES  HES     folio      emisión      estimada    pagado      fechaPago
const V: FilaV[] = [
  ["V-001", "Minera A", "Mantención", "servicio", "2026-03-01", 12000000, "4500-118", "terminado", null, true, "2026-09-10", false, null, 1201, "2026-09-12", "2026-11-20", null, null],
  ["V-002", "Minera A", "Mantención", "servicio", "2026-03-01", 14600000, "4500-118", "terminado", null, true, "2026-10-28", true, "1000234", null, null, "2026-12-20", null, null],
  ["V-003", "Minera B", "Correas", "servicio", "2026-08-05", 10500000, "7700-55", "terminado", null, true, "2026-10-30", true, null, null, null, "2026-12-30", null, null],
  ["V-004", "Minera B", "Bomba", "servicio", "2026-10-15", 3200000, null, "terminado", null, false, null, false, null, null, null, "2027-01-15", null, null],
  ["V-005", "Constructora C", "Grúa", "arriendo", "2026-09-25", 4500000, "2210", "terminado", "GD-889", false, null, false, null, 1210, "2026-11-01", "2026-12-01", null, null],
  ["V-006", "Constructora C", "Grúa", "arriendo", "2026-09-25", 4500000, "2210", "en_curso", null, false, null, false, null, null, null, "2027-01-05", null, null],
  ["V-007", "Minera A", "Mantención", "servicio", "2026-03-01", 15000000, "4500-118", "terminado", null, true, "2026-08-12", false, null, 1188, "2026-08-20", null, 17850000, "2026-10-18"],
  ["V-008", "Minera B", "Correas", "servicio", "2026-08-05", 8000000, "7700-55", "terminado", null, true, "2026-08-28", true, "88412", 1195, "2026-09-01", "2026-11-10", null, null],
  ["V-009", "Industrial D", "Estructura", "venta", null, 22000000, null, null, null, false, null, false, null, null, null, null, null, null],
  ["V-010", "Minera B", "Correas", "servicio", "2026-08-05", 9000000, "7700-55", "en_curso", null, true, null, true, null, null, null, null, null, null],
  ["V-011", "Minera A", "Mantención", "servicio", "2026-03-01", 9000000, "4500-118", "terminado", null, true, "2026-09-20", false, null, 1199, "2026-09-25", "2026-11-24", null, null],
];
const CEDIDAS = new Set([1201, 1195]);

const hitos = V.map(([id, cliente, proyecto, tipo, aceptada, neto, oc, trabajo, guia, reqEdp, edp, reqHes, hes, folio, emision, estimada, pagado, fechaPago]) => {
  const base: HitoBase = {
    id, codigo: id, clienteId: cliente, proyectoId: proyecto, descripcion: id, tipo: tipo as HitoBase["tipo"], periodo: null, cotizacionNumero: null,
    fechaAceptacion: aceptada, neto, ocClienteNumero: oc, estadoTrabajo: trabajo, guiaDespacho: guia, requiereEdp: reqEdp, edpFechaAprobacion: edp,
    requiereHes: reqHes, hesNumero: hes, fechaEstimadaPago: estimada, condicionPagoDias: null, comentario: null, anulado: false,
  };
  const factura: FacturaDeHito | null = folio
    ? { documentoId: `d${folio}`, folio: String(folio), fechaEmision: emision!, total: Math.round(neto * 1.19), pagado: pagado ?? 0, fechaPagoReal: fechaPago, cedida: CEDIDAS.has(folio) }
    : null;
  return calcularHito(base, factura, CONDICION[cliente], P, HOY);
});
const h = (id: string) => hitos.find((x) => x.id === id)!;

const ETAPAS_EXCEL: Record<string, string> = {
  "V-001": "Por cobrar", "V-002": "Lista para facturar", "V-003": "Esperando HES", "V-004": "Esperando OC", "V-005": "Por cobrar", "V-006": "En ejecución",
  "V-007": "Cobrada", "V-008": "Vencida", "V-009": "Cotización enviada", "V-010": "En ejecución", "V-011": "Por cobrar",
};
for (const [id, etapa] of Object.entries(ETAPAS_EXCEL)) assert.equal(h(id).etapa, etapa, `etapa de ${id}`);
assert.equal(h("V-001").vence, "2026-11-11");
assert.equal(h("V-008").diasVencida, 19);
assert.equal(h("V-002").totalConIva, 17374000);
assert.equal(h("V-001").montoFlujo, 0, "cedida: entra por factoring, no por cobros");
assert.equal(h("V-011").montoFlujo, 10710000);
assert.equal(h("V-002").fechaFlujo, "2026-12-20");
assert.equal(h("V-009").montoFlujo, 0, "no aceptada no entra al flujo");
assert.equal(h("V-007").saldo, 0);

// ---------- Compras y CxP (C-001 … C-008) ---------------------------------------

type FilaC = [string, string, string, number | null, string | null, string | null, string | null, "si" | null, number | null, number | null, string | null, string | null, string | null];
//            id     proyecto  proveedor neto      aprobó      visado      OC         recepción factura   total      vence       programada  pagoReal
const C: FilaC[] = [
  ["C-001", "Mantención", "X", 4800000, "JP Mantención", "2026-10-20", "P-0127", "si", 5521, 5712000, "2026-11-30", "2026-11-28", null],
  ["C-002", "General", "Y", null, null, null, null, null, 933, 1190000, "2026-11-15", null, null],
  ["C-003", "Correas", "Z", 2500000, "JP Correas", "2026-10-10", "P-0125", "si", 7710, 3272500, "2026-12-10", null, null],
  ["C-004", "Bomba", "W", 2000000, "Gerente", "2026-10-16", "P-0130", "si", 5390, 2380000, "2026-11-03", "2026-11-03", "2026-11-03"],
  ["C-005", "Grúa", "V", 1500000, "JP Arriendos", null, null, null, null, null, null, null, null],
  ["C-006", "Mantención", "U", 6000000, null, null, null, null, null, null, null, null, null],
  ["C-007", "Correas", "T", 3000000, "JP Correas", "2026-10-01", "P-0122", "si", 7801, 3570000, "2026-10-30", null, null],
  ["C-008", "Mantención", "X", 1200000, "JP Mantención", "2026-11-02", "P-0133", null, null, null, null, null, null],
];
const compras = C.map(([id, proyecto, prov, neto, aprobo, visado, oc, recepcion, folio, total, vence, programada, pagoReal]) =>
  calcularCompra(
    {
      id, codigo: id, proyectoId: proyecto, proveedorId: prov, descripcion: id, netoCotizado: neto, aprobadoPor: aprobo, fechaAprobacion: aprobo ? "2026-10-01" : null,
      fechaVisado: visado, ocNumero: oc, recepcion, facturaFolio: folio ? String(folio) : null, facturaTotal: total, facturaVence: vence, fechaProgramada: programada,
      fechaPagoReal: pagoReal, comentario: null, anulada: false,
    },
    P,
    HOY,
  ),
);
const c = (id: string) => compras.find((x) => x.id === id)!;
const PASOS_EXCEL: Record<string, string> = {
  "C-001": "Pago programado", "C-002": "Factura sin OC: regularizar", "C-003": "Revisar diferencia con la OC", "C-004": "Pagada",
  "C-005": "Falta visado de Finanzas", "C-006": "Falta aprobación JP o gerente", "C-007": "Vencida: programar pago ya", "C-008": "Esperar recepción conforme",
};
for (const [id, paso] of Object.entries(PASOS_EXCEL)) assert.equal(c(id).paso, paso, `siguiente paso de ${id}`);
assert.equal(c("C-003").diferenciaVsOc, 297500);
assert.equal(c("C-002").comprometidoNeto, 1000000);
assert.equal(c("C-003").comprometidoNeto, 2750000);
assert.equal(c("C-008").fechaFlujo, "2026-12-02", "visada sin factura: visado + plazo del proveedor");
assert.equal(c("C-008").montoFlujo, 1428000);
assert.equal(c("C-005").comprometidoNeto, 0, "sin visar no compromete");

// ---------- Factoring (operación 7) ----------------------------------------------

const cesionBase = (folio: string, nominal: number, costo: number, vence: string, estimada: string): CesionBase => ({
  id: folio, operacionId: "7", operacionNumero: "7", factorNombre: "Itaú Factoring", recurso: "con", fechaCesion: "2026-09-16", documentoId: folio, folio, clienteId: null,
  nominal, pctAnticipo: 0.9, costoFactor: costo, fechaAnticipo: "2026-09-16", vence, fechaEstimadaPago: estimada, fechaPagoReal: null, factorConfirmaFecha: null,
  moraCobrada: null, excedenteRecibidoFecha: null, tasaMora: 0.012,
});
const cesiones = [cesionBase("1201", 14280000, 380000, "2026-11-11", "2026-11-20"), cesionBase("1195", 9520000, 210000, "2026-10-16", "2026-11-10")].map((x) => calcularCesion(x, HOY));
assert.deepEqual(
  cesiones.map((x) => [x.anticipo, x.netoRecibido, x.diasMora, x.moraEstimada, x.excedenteEsperado, x.estado, x.fechaFlujo, x.montoFlujo]),
  [
    [12852000, 12472000, 0, 0, 1428000, "Vigente", "2026-11-20", 1428000],
    [8568000, 8358000, 19, 65117, 886883, "En mora: cobrar al cliente", "2026-11-10", 886883],
  ],
);

// ---------- Banco diario ---------------------------------------------------------

const mov = (id: string, fecha: string, monto: number, categoria: string | null, respaldo: boolean): MovimientoBase => ({
  id, cuentaId: "cc", fecha, glosa: id, monto, categoriaId: categoria, proyectoId: null, responsable: null, tieneRespaldo: respaldo, documentoRef: null, conciliaciones: 0, comentario: null,
});
const movimientos = [
  mov("TRANSF A PROVEEDOR W", "2026-11-03", -2380000, "pago", true),
  mov("COM MANTENCION CTA", "2026-11-03", -18500, "comision", true),
  mov("COPEC RUTA 5 SUR", "2026-11-03", -185000, "tarjeta", false),
  mov("SODIMAC CONSTRUCTOR", "2026-11-02", -412000, "tarjeta", false),
  mov("AMAZON MKTPLACE", "2026-10-29", -96500, null, false),
  mov("TRANSF DE 76.XXX.XXX-X", "2026-11-02", 3200000, null, false),
  mov("NOMINA REMUNERACIONES", "2026-10-30", -21850000, "remuneraciones", true),
].map((m) => calcularMovimiento(m, P, HOY));
assert.deepEqual(movimientos.map((m) => [m.estado, m.diasSinAclarar, m.escalar]), [
  ["Conciliado", null, false], ["Conciliado", null, false], ["Por aclarar", 1, false], ["Por aclarar", 2, false], ["Por aclarar", 6, true], ["Por aclarar", 2, false], ["Conciliado", null, false],
]);

// ---------- Flujo de caja --------------------------------------------------------

const partidas: PartidaManual[] = [
  ...["2026-11-01", "2026-12-01", "2027-01-01"].map((mes) => ({ mes, concepto: "remuneraciones" as const, monto: 22000000 })),
  { mes: "2026-11-01", concepto: "impuestos", monto: 6500000 }, { mes: "2026-12-01", concepto: "impuestos", monto: 7000000 }, { mes: "2027-01-01", concepto: "impuestos", monto: 6000000 },
  ...["2026-11-01", "2026-12-01", "2027-01-01"].map((mes) => ({ mes, concepto: "creditos_leasing" as const, monto: 1200000 })),
  { mes: "2026-12-01", concepto: "pago_tarjeta", monto: 1500000 }, { mes: "2027-01-01", concepto: "pago_tarjeta", monto: 1500000 },
];
const flujo = calcularFlujo({ hoy: HOY, cajaBancos: 53000000, deudaTarjeta: 2340000, hitos, compras, cesiones, partidas, p: P });
assert.deepEqual(
  flujo.meses.map((m) => [m.mes, m.cajaInicio, m.cobrosFacturadas, m.cobrosPorFacturar, m.excedentesFactoring, m.totalEntradas, m.pagosProveedores, m.pagoTarjeta, m.totalSalidas, m.cajaFinal, m.holgura, m.alerta]),
  [
    ["2026-11-01", 53000000, 10710000, 0, 2314883, 13024883, 10472000, 2340000, 42512000, 23512883, 3512883, "OK"],
    ["2026-12-01", 23512883, 5355000, 29869000, 0, 35224000, 4700500, 1500000, 36400500, 22336383, 2336383, "OK"],
    ["2027-01-01", 22336383, 0, 9163000, 0, 9163000, 0, 1500000, 30700000, 799383, -19200617, "FALTA CAJA"],
  ],
);
assert.equal(flujo.porFacturarSinFecha, 10710000);
assert.equal(flujo.comprasSinVisar, 7500000);

// ---------- Dashboard ------------------------------------------------------------

const dash = calcularDashboard({ hoy: HOY, cajaBancos: 53000000, deudaTarjeta: 2340000, hitos, compras, cesiones, movimientos });
assert.deepEqual(
  [dash.movimientosPorAclarar, dash.montoPorAclarar, dash.movimientosEscalar, dash.porCobrar, dash.porCobrarVencido, dash.porCobrarCedido, dash.terminadoSinFacturar, dash.listoParaFacturar],
  [4, 2506500, 1, 39865000, 9520000, 23800000, 33677000, 17374000],
);
assert.deepEqual(
  [dash.porPagar, dash.porPagarVencido, dash.porPagar30, dash.facturasSinOc, dash.comprasEsperandoVisado, dash.cedidasVigentes, dash.anticiposVigentes, dash.facturasEnMora, dash.moraEstimada, dash.excedentesPorRecibir],
  [13744500, 3570000, 11900000, 1, 1500000, 23800000, 21420000, 1, 65117, 2314883],
);
assert.deepEqual(dash.porEtapa.map((e) => [e.etapa, e.n, e.monto]), [
  ["Cotización enviada", 1, 26180000], ["Por iniciar", 0, 0], ["En ejecución", 2, 16065000], ["Esperando aprobación EDP", 0, 0], ["Esperando OC", 1, 3808000],
  ["Esperando HES", 1, 12495000], ["Lista para facturar", 1, 17374000], ["Por cobrar", 3, 30345000], ["Vencida", 1, 9520000], ["Cobrada", 1, 17850000],
]);
const mandante = (id: string) => dash.porMandante.find((m) => m.clienteId === id)!;
assert.deepEqual([mandante("Minera A").terminadoSinFacturar, mandante("Minera A").porCobrar, mandante("Minera A").vencido], [17374000, 24990000, 0]);
assert.deepEqual([mandante("Minera B").terminadoSinFacturar, mandante("Minera B").porCobrar, mandante("Minera B").vencido], [16303000, 9520000, 9520000]);

// ---------- Proyectos ------------------------------------------------------------

const proyecto = (id: string, presupuesto: number | null): ProyectoBase => ({ id, codigo: id, nombre: id, mandanteId: null, tipo: "contrato", jefeProyecto: null, presupuestoCostos: presupuesto, estado: "activo" });
const mant = cifrasProyecto(proyecto("Mantención", 60000000), hitos, compras);
assert.deepEqual([mant.vendido, mant.facturado, mant.porFacturar, mant.porCobrar, mant.comprometido, mant.disponible, mant.margen], [50600000, 36000000, 14600000, 24990000, 6000000, 54000000, 44600000]);
assert.ok(Math.abs(mant.margenPct! - 0.8814) < 0.0001);
const correas = cifrasProyecto(proyecto("Correas", 12000000), hitos, compras);
assert.deepEqual([correas.vendido, correas.facturado, correas.porCobrar, correas.comprometido, correas.disponible, correas.margen], [27500000, 8000000, 9520000, 5750000, 6250000, 21750000]);
assert.deepEqual([cifrasProyecto(proyecto("General", null), hitos, compras).comprometido, cifrasProyecto(proyecto("General", null), hitos, compras).disponible], [1000000, null]);

// ---------- Ramas de cada regla ---------------------------------------------------

{
  const base = { fechaAceptacion: "2026-01-01", factura: null, estadoTrabajo: "terminado" as const, requiereEdp: false, edpFechaAprobacion: null, ocClienteNumero: "1", requiereHes: false, hesNumero: null };
  assert.equal(etapaHito({ ...base, estadoTrabajo: null }, HOY), "Por iniciar");
  assert.equal(etapaHito({ ...base, factura: { saldo: 0, vence: "2026-01-01" } }, HOY), "Cobrada", "saldo 0 gana aunque esté vencida");
  assert.equal(etapaHito({ ...base, factura: { saldo: 1, vence: HOY } }, HOY), "Por cobrar", "vence hoy todavía no está vencida");
  assert.equal(etapaHito({ ...base, requiereEdp: true }, HOY), "Esperando aprobación EDP");
  assert.equal(etapaHito({ ...base, ocClienteNumero: "  " }, HOY), "Esperando OC");
}
{
  const base: CompraBase = {
    id: "x", codigo: "x", proyectoId: null, proveedorId: null, descripcion: "", netoCotizado: 1000000, aprobadoPor: "JP", fechaAprobacion: "2026-10-01", fechaVisado: "2026-10-02",
    ocNumero: "P-1", recepcion: "si", facturaFolio: "9", facturaTotal: 1190000, facturaVence: "2026-12-01", fechaProgramada: null, fechaPagoReal: null, comentario: null, anulada: false,
  };
  assert.equal(siguientePasoCompra({ ...base, facturaTotal: 1191000 }, P, HOY), "Programar pago", "diferencia igual a la tolerancia no detiene");
  assert.equal(siguientePasoCompra({ ...base, facturaTotal: 1191001 }, P, HOY), "Revisar diferencia con la OC", "tolerancia + 1 sí");
  assert.equal(siguientePasoCompra({ ...base, facturaTotal: 1188999 }, P, HOY), "Revisar diferencia con la OC", "también si la factura es menor (valor absoluto)");
  assert.equal(siguientePasoCompra({ ...base, recepcion: "parcial" }, P, HOY), "Esperar recepción conforme");
  assert.equal(siguientePasoCompra({ ...base, anulada: true }, P, HOY), "Anulada");
  assert.equal(calcularCompra({ ...base, anulada: true }, P, HOY).montoFlujo, 0);
}
{
  const base = cesionBase("1", 1000000, 0, "2026-10-01", "2026-10-20");
  assert.equal(calcularCesion({ ...base, fechaPagoReal: "2026-10-10" }, HOY).estado, "Cliente pagó: confirmar con el factor");
  assert.equal(calcularCesion({ ...base, fechaPagoReal: "2026-10-10", factorConfirmaFecha: "2026-10-11" }, HOY).estado, "Esperando excedente");
  assert.equal(calcularCesion({ ...base, excedenteRecibidoFecha: "2026-10-15" }, HOY).montoFlujo, 0);
  assert.equal(calcularCesion({ ...base, fechaPagoReal: "2026-10-10", moraCobrada: 5000 }, HOY).excedenteEsperado, 1000000 - 900000 - 5000, "la mora cobrada reemplaza a la estimada");
}
{
  const reglas = [
    { id: "a", cuentaId: null, patron: "com mantencion", montoMin: null, montoMax: null, categoriaId: "comision", proyectoId: null, prioridad: 2, activa: true },
    { id: "b", cuentaId: null, patron: "COM", montoMin: null, montoMax: -1, categoriaId: "otro", proyectoId: null, prioridad: 1, activa: false },
  ];
  assert.equal(reglaQueCalza({ glosa: "COM MANTENCION CTA", monto: -18500, cuentaId: "cc" }, reglas)?.id, "a", "la inactiva no cuenta");
  assert.equal(reglaQueCalza({ glosa: "OTRA COSA", monto: -1, cuentaId: "cc" }, reglas), null);
  assert.equal(huellaMovimiento("c", "2026-11-03", -18500, "  COM  Mantención ", null), huellaMovimiento("c", "2026-11-03", -18500, "com mantención", ""));
}
// ---------- Clasificación con la lista maestra de Finanzas (Categoría → Subcategoría) -----------
{
  const cat = (id: string, sentido: CategoriaLista["sentido"], extra: Partial<CategoriaLista> = {}): CategoriaLista => ({
    id, nombre: id, sentido, requiereProyecto: false, afectaResultado: true, cuentaContable: null, orden: 0, activa: true, ...extra,
  });
  const CATS = [
    cat("Costos Financieros", "egreso", { orden: 5 }),
    cat("Operaciones y Proyectos", "egreso", { orden: 3, requiereProyecto: true }),
    cat("Traspasos Internos", "ambos", { orden: 8, afectaResultado: false }),
    cat("Servicios", "ingreso", { orden: 11 }),
    cat("Remuneraciones", "egreso", { activa: false }),
  ];
  const SUBS: Subcategoria[] = [
    { id: "comisiones", categoriaId: "Costos Financieros", nombre: "Comisiones Bancarias", cuentaContable: null, orden: 4, activa: true },
    { id: "combustible", categoriaId: "Operaciones y Proyectos", nombre: "Vehículos (Autorenta/Combustible)", cuentaContable: null, orden: 14, activa: true },
    { id: "tarjeta", categoriaId: "Traspasos Internos", nombre: "Pago Tarjeta de Crédito", cuentaContable: null, orden: 1, activa: true },
  ];
  const conSub = new Set(SUBS.map((x) => x.categoriaId));

  // Un cargo solo ofrece gastos y lo que va en ambos sentidos; nunca una categoría antigua.
  assert.deepEqual(categoriasPara(-1000, CATS).map((c) => c.id), ["Operaciones y Proyectos", "Costos Financieros", "Traspasos Internos"]);
  assert.deepEqual(categoriasPara(1000, CATS).map((c) => c.id), ["Traspasos Internos", "Servicios"]);

  // La glosa sin números ni fechas; las nóminas y las glosas casi vacías no sirven para aprender.
  assert.equal(glosaComparable("PAGO TGR 12/10/2026 FOLIO 3344"), "pago tgr folio");
  assert.equal(glosaComparable("Comisión  Mantención"), "comision mantencion");
  assert.equal(glosaComparable("NOMINA12.10.2026"), "");
  assert.equal(glosaComparable("TEF 123"), "");

  const reglas = [
    { id: "r-texto", cuentaId: null, patron: "COM MANT", montoMin: null, montoMax: null, categoriaId: "Costos Financieros", subcategoriaId: "comisiones", proyectoId: null, prioridad: 100, activa: true },
    { id: "r-rut", cuentaId: null, patron: "", contraparteRut: "76.123.456-0", montoMin: null, montoMax: null, categoriaId: "Operaciones y Proyectos", subcategoriaId: "combustible", proyectoId: "pry-1", prioridad: 100, activa: true },
  ];
  // Regla por RUT: manda el RUT aunque la glosa no diga nada, y va antes que la de texto a igual prioridad.
  assert.equal(reglaQueCalza({ glosa: "TRANSF A 761234560 COM MANT", monto: -5000, cuentaId: "cc", contraparteRut: "76123456-0" }, reglas)?.id, "r-rut");
  assert.equal(reglaQueCalza({ glosa: "TRANSF A OTRO", monto: -5000, cuentaId: "cc", contraparteRut: "11111111-1" }, reglas), null);
  const porTexto = sugerirClasificacion({ glosa: "COM MANT CTA CTE", monto: -18500, cuentaId: "cc" }, reglas, []);
  assert.equal(porTexto?.origen, "regla");
  assert.equal(porTexto?.subcategoriaId, "comisiones");
  assert.ok(aplicableSola(porTexto, CATS, conSub), "una regla completa se aplica sola al importar");
  assert.ok(aplicableSola(sugerirClasificacion({ glosa: "x", monto: -1, cuentaId: "cc", contraparteRut: "761234560" }, reglas, []), CATS, conSub), "pide proyecto, pero la regla lo trae");
  assert.ok(!aplicableSola({ ...porTexto!, subcategoriaId: null }, CATS, conSub), "sin subcategoría no se aplica sola");

  // Aprender de lo ya clasificado: misma glosa sin números, mismo signo, el más reciente.
  const anteriores: Clasificado[] = [
    { id: "a1", fecha: "2026-10-03", glosa: "PAGO TARJETA CREDITO 4455", monto: -900000, contraparteRut: null, categoriaId: "Traspasos Internos", subcategoriaId: "tarjeta", proyectoId: null },
    { id: "a2", fecha: "2026-10-20", glosa: "TRANSF. DE 76123456-0", monto: 2000000, contraparteRut: "761234560", categoriaId: "Servicios", subcategoriaId: null, proyectoId: "pry-2" },
  ];
  const tarjeta = sugerirClasificacion({ glosa: "PAGO TARJETA CREDITO 7788", monto: -1200000, cuentaId: "cc" }, [], anteriores);
  assert.equal(tarjeta?.origen, "historial");
  assert.equal(tarjeta?.subcategoriaId, "tarjeta");
  assert.equal(sugerirClasificacion({ glosa: "PAGO TARJETA CREDITO 7788", monto: 1200000, cuentaId: "cc" }, [], anteriores), null, "el signo tiene que calzar");
  assert.ok(!aplicableSola(tarjeta, CATS, conSub), "lo aprendido solo se sugiere, no se aplica solo");
  const mismoRut = sugerirClasificacion({ glosa: "TRANSF. DE 76123456-0", monto: 3500000, cuentaId: "cc", contraparteRut: "76.123.456-0" }, [], anteriores);
  assert.equal(mismoRut?.categoriaId, "Servicios");
  assert.equal(mismoRut?.proyectoId, "pry-2");
  assert.equal(sugerirClasificacion({ glosa: "TRANSF. DE 99888777-6", monto: 3500000, cuentaId: "cc", contraparteRut: "998887776" }, [], anteriores), null, "otro RUT con la misma glosa no calza");

  // El ingreso de un cobro sale del hito facturado.
  assert.equal(categoriaDeIngreso("servicio", "contrato"), "Servicios");
  assert.equal(categoriaDeIngreso("arriendo", "arriendo"), "Arriendos");
  assert.equal(categoriaDeIngreso("venta", null), "Ventas");
  assert.equal(categoriaDeIngreso("servicio", "spot"), "Proyecto Spot");
  assert.equal(categoriaDeIngreso(null, null), "Servicios");

  // Resumen del mes: los traspasos no suman en el resultado y lo pendiente va aparte.
  const r = resumenPorCategoria(
    [
      { fecha: "2026-11-02", monto: 5000000, categoriaId: "Servicios", subcategoriaId: null },
      { fecha: "2026-11-03", monto: -18500, categoriaId: "Costos Financieros", subcategoriaId: "comisiones" },
      { fecha: "2026-11-04", monto: -900000, categoriaId: "Traspasos Internos", subcategoriaId: "tarjeta" },
      { fecha: "2026-11-05", monto: -45000, categoriaId: null },
      { fecha: "2026-10-31", monto: -1, categoriaId: "Costos Financieros", subcategoriaId: "comisiones" },
    ],
    CATS,
    SUBS,
    "2026-11-01",
    "2026-11-30",
  );
  assert.equal(r.totalIngresos, 5000000);
  assert.equal(r.totalEgresos, 18500, "el pago de la tarjeta no es gasto");
  assert.deepEqual(r.sinResultado.map((f) => [f.nombre, f.egresos]), [["Traspasos Internos", 900000]]);
  assert.deepEqual(r.porAclarar, { movimientos: 1, ingresos: 0, egresos: 45000 });
  assert.equal(r.resultado.find((f) => f.categoriaId === "Costos Financieros")?.subcategorias[0].nombre, "Comisiones Bancarias");

  // IA: su sugerencia solo vale si calza con la lista de hoy y con el sentido del monto.
  const ia = { categoria_id: "Costos Financieros", subcategoria_id: "comisiones", confianza: 0.97, motivo: "es una comisión", modelo: "x", en: "2026-11-24" };
  const sIa = sugerenciaDeIa(ia, -18500, CATS, SUBS);
  assert.equal(sIa?.origen, "ia");
  assert.equal(sIa?.subcategoriaId, "comisiones");
  assert.equal(sugerenciaDeIa(ia, 18500, CATS, SUBS), null, "un abono no puede ser un gasto");
  assert.equal(sugerenciaDeIa({ ...ia, subcategoria_id: null }, -1, CATS, SUBS), null, "sin subcategoría no vale si la categoría las tiene");
  assert.equal(sugerenciaDeIa({ ...ia, categoria_id: "Remuneraciones", subcategoria_id: null }, -1, CATS, SUBS), null, "una categoría antigua no vale");
  assert.ok(!aplicableSola(sIa, CATS, conSub), "la IA nunca se aplica como una regla");
  assert.ok(iaAplicableSola(sIa, 0.95, CATS));
  assert.ok(!iaAplicableSola(sIa, 0.98, CATS), "bajo el umbral, solo sugiere");
  const combustible = sugerenciaDeIa({ ...ia, categoria_id: "Operaciones y Proyectos", subcategoria_id: "combustible", confianza: 0.99 }, -1, CATS, SUBS);
  assert.ok(!iaAplicableSola(combustible, 0.9, CATS), "lo que pide proyecto nunca se aplica solo");
  // Aceptar en bloque: reglas y anteriores siempre; la IA solo desde 90 %.
  assert.ok(esSegura(porTexto) && esSegura(tarjeta), "reglas y movimientos anteriores son seguros");
  assert.ok(esSegura(sIa), "IA al 97 % es segura");
  assert.ok(!esSegura({ ...sIa!, confianza: 0.85 }), "IA al 85 % se revisa a mano");
  assert.ok(!esSegura(null));
  assert.equal(resultadoIa(ia, "Costos Financieros", "comisiones"), "aceptada");
  assert.equal(resultadoIa(ia, "Costos Financieros", null), "corregida");
  assert.equal(resultadoIa(null, "Costos Financieros", "comisiones"), null);
  assert.deepEqual(
    aciertoIa([{ fecha: "2026-11-01", iaResultado: "aceptada" }, { fecha: "2026-11-20", iaResultado: "corregida" }, { fecha: "2026-11-21", iaResultado: "aceptada" }, { fecha: "2026-11-21", iaResultado: null }], "2026-11-10"),
    { revisados: 2, aceptadas: 1, corregidas: 1, pct: 0.5 },
  );

  // Reglas propuestas: 3 veces igual y sin regla → se propone; si el destino varía, no.
  const vez = (id: string, glosa: string, rut: string | null, sub = "comisiones", cat = "Costos Financieros"): Clasificado => ({ id, fecha: "2026-11-01", glosa, monto: -100, contraparteRut: rut, categoriaId: cat, subcategoriaId: sub, proyectoId: null });
  const props = proponerReglas(
    [
      vez("1", "COM MANTENCION CTA 01", null), vez("2", "COM MANTENCION CTA 02", null), vez("3", "COM MANTENCION CTA 03", null),
      vez("4", "TRANSF A 76123456-0", "761234560", "combustible", "Operaciones y Proyectos"), vez("5", "TRANSF A 76123456-0", "761234560", "combustible", "Operaciones y Proyectos"),
      vez("6", "TRANSF A 76123456-0", "761234560", "combustible", "Operaciones y Proyectos"),
      vez("7", "PAGO VARIOS 1", "111111111"), vez("8", "PAGO VARIOS 2", "111111111", "tarjeta", "Traspasos Internos"), vez("9", "PAGO VARIOS 3", "111111111"),
    ],
    [],
  );
  assert.deepEqual(props.map((x) => [x.tipo, x.valor, x.veces]), [["texto", "com mantencion cta", 3], ["rut", "761234560", 3]]);
  assert.equal(proponerReglas([vez("1", "COM MANTENCION CTA 01", null), vez("2", "COM MANTENCION CTA 02", null), vez("3", "COM MANTENCION CTA 03", null)], reglas).length, 0, "ya hay una regla que lo cubre");

  // Una categoría con subcategorías no queda conciliada sin elegir una.
  const mov: MovimientoBase = { id: "m", cuentaId: "cc", fecha: "2026-11-03", glosa: "x", monto: -1, categoriaId: "Costos Financieros", faltaSubcategoria: true, proyectoId: null, responsable: null, tieneRespaldo: true, documentoRef: null, conciliaciones: 0, comentario: null };
  assert.equal(calcularMovimiento(mov, P, HOY).estado, "Por aclarar");
  assert.equal(calcularMovimiento({ ...mov, faltaSubcategoria: false, subcategoriaId: "comisiones" }, P, HOY).estado, "Conciliado");
}
assert.deepEqual(generarHitos({ tipo: "partes", partes: 3 }, 1000000).map((x) => x.neto), [333333, 333333, 333334], "el último absorbe el redondeo");
assert.deepEqual(generarHitos({ tipo: "mensual", desde: "2026-10-01", hasta: "2026-12-15", prefijo: "Arriendo", montoMensual: 4500000 }, 0).map((x) => [x.periodo, x.neto]), [
  ["Arriendo oct", 4500000], ["Arriendo nov", 4500000], ["Arriendo dic", 4500000],
]);
assert.equal(generarHitos({ tipo: "unica" }, 5)[0].periodo, "Única");
assert.ok(rutValido("76.123.456-0") === rutValido("761234560") && rutValido("11.111.111-1") && !rutValido("11.111.111-2"));

console.log("Gestión financiera verificada: etapas, siguiente paso, factoring, banco, clasificación por categoría, flujo de caja, dashboard y proyectos iguales al Excel.");
