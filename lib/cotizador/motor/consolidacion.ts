import type { LegalParameterSet, QuotationInput, StaffResult } from "./types";
import { calcularStaffResult } from "./remuneraciones";
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
  const staff = input.staff.map((s) => calcularStaffResult(s, P, input.horasBaseMes));

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

  const ecoItems: EcoLineItem[] = [
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
    { item: "3", descripcion: "Movilización", unidad: "gl", cantidad: 1, precioUnitario: movilizacion, total: movilizacion },
    { item: "4", descripcion: "Desmovilización", unidad: "gl", cantidad: 1, precioUnitario: desmovilizacion, total: desmovilizacion },
    ...input.rxItems.map((rx, idx) => ({
      item: String(5 + idx),
      descripcion: rx.descripcion,
      unidad: "un",
      cantidad: rx.cantidad,
      precioUnitario: rx.precioUnitario,
      total: rx.cantidad * rx.precioUnitario,
    })),
    {
      item: String(5 + input.rxItems.length),
      descripcion: `Gastos Generales ECO (${(input.margenes.ggEcoPct * 100).toFixed(0)}%)`,
      unidad: "gl",
      cantidad: 1,
      precioUnitario: ggEco,
      total: ggEco,
    },
    {
      item: String(6 + input.rxItems.length),
      descripcion: `Utilidad ECO (${(input.margenes.utilidadEcoPct * 100).toFixed(0)}%)`,
      unidad: "gl",
      cantidad: 1,
      precioUnitario: utilidadEco,
      total: utilidadEco,
    },
  ];

  const ecoTotalNeto = ecoItems.reduce((acc, i) => acc + i.total, 0);
  const ecoIva = ecoTotalNeto * input.margenes.ivaPct;
  const ecoConIva = ecoTotalNeto + ecoIva;

  const margenEfectivoTotal = costoMensualTotal > 0 ? (ecoTotalNeto - costoMensualTotal) / costoMensualTotal : 0;
  const warnDobleMargen = input.margenes.baseCalculoEco === "costo_cargado";

  const boletaGarantia = input.montoContratoBoleta * input.tasaAnualBoleta * (input.duracionMeses / 12);

  return {
    staff,
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
