import type { LegalParameterSet, PersonalSpotContratoResult, QuotationInput, StaffResult } from "./types";
import { calcularStaffResult } from "./remuneraciones";
import { calcularPersonalSpotContratoResult } from "./personal-spot-contrato";
import {
  calcularAlimentacionPorCargo,
  calcularCostoVehiculo,
  calcularDepreciacionEquipo,
  totalAlimentacion,
  totalCategoria,
} from "./costos";
import { numeroATexto } from "./numeroATexto";

export interface CategoriaCostoResult {
  categoria: string;
  nombre: string;
  monto: number;
  asignacion: "directo" | "indirecto" | "mixto";
}

export interface EcoLineItem {
  item: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
}

export interface QuotationResult {
  staff: StaffResult[];
  personalSpotContrato: PersonalSpotContratoResult[];
  tarifaCuadrillaDia: number;
  costoPersonalSpot: number;
  alimentacionTotal: number;
  alimentacionPorCargo: ReturnType<typeof calcularAlimentacionPorCargo>;
  categorias: CategoriaCostoResult[];
  costoMensualTotal: number;
  costoDirecto: number;
  costoIndirecto: number;
  mob: number;
  gg: number;
  utilidad: number;
  ventaMensual: number;
  costoTotalServicio: number;
  ecoItems: EcoLineItem[];
  ecoItemsPersonalSpotContrato: EcoLineItem[];
  ecoSubtotalPersonalSpotContrato: number;
  ecoBase: number;
  ggEco: number;
  utilidadEco: number;
  ecoTotalNeto: number;
  ecoIva: number;
  ecoConIva: number;
  glosa: string;
  margenEfectivoTotal: number;
  recargoCompuesto: number;
  warnDobleMargen: boolean;
  boletaGarantia: number;
}

export function calcularCotizacion(input: QuotationInput, P: LegalParameterSet): QuotationResult {
  // Las filas jsonb antiguas pueden no traer tipoServicio; se asume SPOT, que
  // era el unico modo cuando se guardaron.
  const spot = (input.tipoServicio ?? "spot") === "spot";
  const staff = input.staff.map((s) => calcularStaffResult(s, P, input.horasBaseMes));

  // Personal SPOT del contrato — solo aparece en cotizaciones contrato_permanente
  // (input.personalSpotContrato ?? [] mantiene esto en blanco para SPOT y para
  // filas jsonb antiguas sin esta clave). Facturación por HH25, en paralelo al
  // personal permanente de `staff`; nunca modifica tarifaCuadrillaDia/ecoItems.
  const personalSpotContrato = (input.personalSpotContrato ?? []).map((p) =>
    calcularPersonalSpotContratoResult(p, P, input.horasBaseMes),
  );
  const costoPersonalSpotContratoTotal = personalSpotContrato.reduce((acc, p) => acc + p.costoMensual, 0);

  const tarifaCuadrillaDia = staff.reduce((acc, s) => acc + s.costoCargoServicio, 0);
  const costoPersonalSpot = tarifaCuadrillaDia * input.diasServicio * input.factorContingencia;

  const alimentacionPorCargo = calcularAlimentacionPorCargo(staff, input.tarifasAlimentacion, input.diasAlimentacionMes);
  const alimentacionTotal = totalAlimentacion(alimentacionPorCargo);

  const insumosMateriales = totalCategoria(
    input.costItems.filter((i) => i.categoria === "insumo_material"),
    input.duracionMeses,
  );
  const insumosOficina = totalCategoria(
    input.costItems.filter((i) => i.categoria === "insumo_oficina"),
    input.duracionMeses,
  );
  const utilesAseo = totalCategoria(
    input.costItems.filter((i) => i.categoria === "util_aseo"),
    input.duracionMeses,
  );
  const eppMensual = totalCategoria(
    input.costItems.filter((i) => i.categoria === "epp"),
    input.duracionMeses,
  );
  const pemMensual = totalCategoria(
    input.costItems.filter((i) => i.categoria === "puesta_en_marcha"),
    input.duracionMeses,
  );

  const equiposTotal = input.equipos.reduce(
    (acc, e) => acc + calcularDepreciacionEquipo(e, input.metodoDepreciacionEquipos).mensual,
    0,
  );
  const vehiculosTotal = input.vehiculos.reduce((acc, v) => acc + calcularCostoVehiculo(v, P.uf).total, 0);

  const asignacionCategoria = (items: { asignacion: "directo" | "indirecto" }[]): "directo" | "indirecto" | "mixto" => {
    const set = new Set(items.map((i) => i.asignacion));
    if (set.size === 0) return "indirecto";
    if (set.size === 1) return [...set][0];
    return "mixto";
  };

  const categorias: CategoriaCostoResult[] = [
    { categoria: "personal_spot", nombre: "Personal SPOT", monto: costoPersonalSpot, asignacion: "directo" },
    ...(personalSpotContrato.length > 0
      ? [
          {
            categoria: "personal_spot_contrato",
            nombre: "Personal SPOT del Contrato",
            monto: costoPersonalSpotContratoTotal,
            asignacion: "directo" as const,
          },
        ]
      : []),
    { categoria: "alimentacion", nombre: "Alimentación", monto: alimentacionTotal, asignacion: "directo" },
    {
      categoria: "insumo_material",
      nombre: "Insumos y Materiales",
      monto: insumosMateriales,
      asignacion: asignacionCategoria(input.costItems.filter((i) => i.categoria === "insumo_material")),
    },
    {
      categoria: "insumo_oficina",
      nombre: "Insumos de Oficina",
      monto: insumosOficina,
      asignacion: asignacionCategoria(input.costItems.filter((i) => i.categoria === "insumo_oficina")),
    },
    {
      categoria: "util_aseo",
      nombre: "Útiles de Aseo",
      monto: utilesAseo,
      asignacion: asignacionCategoria(input.costItems.filter((i) => i.categoria === "util_aseo")),
    },
    {
      categoria: "epp",
      nombre: "EPP",
      monto: eppMensual,
      asignacion: asignacionCategoria(input.costItems.filter((i) => i.categoria === "epp")),
    },
    {
      categoria: "equipo_herramienta",
      nombre: "Equipos y Herramientas",
      monto: equiposTotal,
      asignacion: asignacionCategoria(input.equipos),
    },
    { categoria: "vehiculo", nombre: "Vehículos", monto: vehiculosTotal, asignacion: asignacionCategoria(input.vehiculos) },
    { categoria: "puesta_en_marcha", nombre: "Puesta en Marcha", monto: pemMensual, asignacion: "indirecto" },
  ];

  const costoMensualTotal = categorias.reduce((acc, c) => acc + c.monto, 0);
  const costoDirecto = categorias.filter((c) => c.asignacion === "directo").reduce((a, c) => a + c.monto, 0);
  const costoIndirecto = costoMensualTotal - costoDirecto;

  const mob = costoMensualTotal * input.margenes.mobPct;
  const gg = costoMensualTotal * input.margenes.ggPct;
  const utilidad = costoMensualTotal * input.margenes.utilidadPct;
  const ventaMensual = costoMensualTotal + mob;
  const costoTotalServicio = costoMensualTotal + mob + gg + utilidad;

  const ecoBase = input.margenes.baseCalculoEco === "costo_puro" ? costoMensualTotal : costoTotalServicio;
  const ggEco = ecoBase * input.margenes.ggEcoPct;
  const utilidadEco = ecoBase * input.margenes.utilidadEcoPct;

  const movilizacion = costoTotalServicio / input.divisorMovilizacion;
  const desmovilizacion = movilizacion;

  // precio por cuadrilla para TODO el período de servicio (tarifaCuadrillaDia es el costo
  // de la cuadrilla completa por 1 día; se factura por los `diasServicio` del contrato SPOT).
  const precioCuadrillaPeriodo = tarifaCuadrillaDia * input.diasServicio;

  // Las líneas de servicio del ECO dependen del tipo de contrato:
  //
  // - SPOT: se cobra por cuadrilla (día y noche) para los `diasServicio` del
  //   trabajo puntual, que es el encuadre del Excel original (ECO-1 ítems 1 y 2).
  //   No se toca: son las cifras contrastadas contra el formato real.
  //
  // - contrato_permanente: cobrar "cuadrilla día/noche × días de servicio" no
  //   describe lo que se factura — no hay una cuadrilla puntual, hay una
  //   dotación permanente en faena que se factura por mes. Se reemplaza por una
  //   sola línea mensual valorizada en `ventaMensual` (costo del mes + MOB),
  //   que es el concepto "VENTA MENSUAL" del propio formato Excel (RESUMEN C23).
  //   Se usa esa y NO `costoTotalServicio` a propósito: costoTotalServicio ya
  //   trae dentro GG 7% + Utilidad 10%, y el ECO les suma GG 20% + Utilidad 20%
  //   encima, así que tomarlo como precio de venta aplicaba el margen tres
  //   veces (daba ~80% de margen efectivo en vez de ~42%). El refuerzo por
  //   hora-hombre sigue yendo en su tabla aparte
  //   (ecoItemsPersonalSpotContrato) y suma al total neto.
  //
  //   La oferta se mantiene MENSUAL a propósito (no se multiplica por
  //   duracionMeses): así `margenEfectivoTotal` sigue comparando el neto del mes
  //   contra el costo del mes, y el KPI "neto/mes" del panel sigue siendo
  //   comparable entre cotizaciones SPOT y permanentes. El plazo total ya se
  //   refleja donde corresponde (boletaGarantia y el encabezado del ECO).
  const lineasServicio: EcoLineItem[] = spot
    ? [
        {
          item: "1",
          descripcion: "Cuadrilla día",
          unidad: "servicio",
          cantidad: input.nCuadrillasDia,
          precioUnitario: precioCuadrillaPeriodo,
          total: input.nCuadrillasDia * precioCuadrillaPeriodo,
        },
        {
          item: "2",
          descripcion: "Cuadrilla noche",
          unidad: "servicio",
          cantidad: input.nCuadrillasNoche,
          precioUnitario: precioCuadrillaPeriodo,
          total: input.nCuadrillasNoche * precioCuadrillaPeriodo,
        },
      ]
    : [
        {
          item: "1",
          descripcion: "Servicio mensual de dotación permanente",
          unidad: "mes",
          cantidad: 1,
          precioUnitario: ventaMensual,
          total: ventaMensual,
        },
      ];

  const nServicio = lineasServicio.length;
  const nMov = nServicio + 1;
  const nDesmov = nServicio + 2;
  const nRxBase = nServicio + 3;

  const ecoItems: EcoLineItem[] = [
    ...lineasServicio,
    { item: String(nMov), descripcion: "Movilización", unidad: "gl", cantidad: 1, precioUnitario: movilizacion, total: movilizacion },
    { item: String(nDesmov), descripcion: "Desmovilización", unidad: "gl", cantidad: 1, precioUnitario: desmovilizacion, total: desmovilizacion },
    ...input.rxItems.map((rx, idx) => ({
      item: String(nRxBase + idx),
      descripcion: rx.descripcion,
      unidad: "un",
      cantidad: rx.cantidad,
      precioUnitario: rx.precioUnitario,
      total: rx.cantidad * rx.precioUnitario,
    })),
    {
      item: String(nRxBase + input.rxItems.length),
      descripcion: `Gastos Generales ECO (${(input.margenes.ggEcoPct * 100).toFixed(0)}%)`,
      unidad: "gl",
      cantidad: 1,
      precioUnitario: ggEco,
      total: ggEco,
    },
    {
      item: String(nRxBase + input.rxItems.length + 1),
      descripcion: `Utilidad ECO (${(input.margenes.utilidadEcoPct * 100).toFixed(0)}%)`,
      unidad: "gl",
      cantidad: 1,
      precioUnitario: utilidadEco,
      total: utilidadEco,
    },
  ];

  // Tabla ECO separada para personal SPOT del contrato — refleja la estructura
  // real de un contrato_permanente, que se factura en dos secciones distintas
  // (personal permanente + refuerzo por hora-hombre). Es una tabla aparte solo
  // a efectos de PRESENTACIÓN: su subtotal sí entra al total neto de la oferta
  // (ecoTotalNeto) — es un ingreso más del servicio, y su costo ya está dentro
  // de costoMensualTotal, así que dejarlo fuera subestimaba tanto el precio
  // cobrado como el margen efectivo.
  const ecoItemsPersonalSpotContrato: EcoLineItem[] = personalSpotContrato.map((p, idx) => ({
    item: String(idx + 1),
    descripcion: p.cargo,
    unidad: "HH",
    cantidad: p.horasEstimadasMes,
    precioUnitario: p.costoHH25,
    total: p.costoMensual,
  }));
  const ecoSubtotalPersonalSpotContrato = ecoItemsPersonalSpotContrato.reduce((acc, i) => acc + i.total, 0);

  const ecoTotalNeto = ecoItems.reduce((acc, i) => acc + i.total, 0) + ecoSubtotalPersonalSpotContrato;
  const ecoIva = ecoTotalNeto * input.margenes.ivaPct;
  const ecoConIva = ecoTotalNeto + ecoIva;

  const margenEfectivoTotal = costoMensualTotal > 0 ? (ecoTotalNeto - costoMensualTotal) / costoMensualTotal : 0;
  const warnDobleMargen = input.margenes.baseCalculoEco === "costo_cargado";

  const boletaGarantia = input.montoContratoBoleta * input.tasaAnualBoleta * (input.duracionMeses / 12);

  return {
    staff,
    personalSpotContrato,
    tarifaCuadrillaDia,
    costoPersonalSpot,
    alimentacionTotal,
    alimentacionPorCargo,
    categorias,
    costoMensualTotal,
    costoDirecto,
    costoIndirecto,
    mob,
    gg,
    utilidad,
    ventaMensual,
    costoTotalServicio,
    ecoItems,
    ecoItemsPersonalSpotContrato,
    ecoSubtotalPersonalSpotContrato,
    ecoBase,
    ggEco,
    utilidadEco,
    ecoTotalNeto,
    ecoIva,
    ecoConIva,
    glosa: numeroATexto(ecoTotalNeto),
    margenEfectivoTotal,
    recargoCompuesto: margenEfectivoTotal,
    warnDobleMargen,
    boletaGarantia,
  };
}
