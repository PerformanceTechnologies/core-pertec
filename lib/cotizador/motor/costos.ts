import type { AlimentacionTarifas, CostItemInput, StaffResult } from "./types";

/** Módulo B.1 — Alimentación (corrección C-04: fuente única de dotación). */
export function calcularAlimentacionPorCargo(
  staff: StaffResult[],
  tarifas: AlimentacionTarifas,
  diasAlimentacionMes: number,
) {
  const tarifaDia = tarifas.desayuno + tarifas.almuerzo + tarifas.cena + tarifas.colacion;
  return staff.map((s) => {
    const racionesMes = s.dotacionTotal * diasAlimentacionMes;
    const costoMensual = racionesMes * tarifaDia;
    return { id: s.id, cargo: s.cargo, dotacion: s.dotacionTotal, racionesMes, costoMensual };
  });
}

export function totalAlimentacion(rows: ReturnType<typeof calcularAlimentacionPorCargo>) {
  return rows.reduce((acc, r) => acc + r.costoMensual, 0);
}

/** Módulo B.2-B.4, B.8 — costo mensual de una línea genérica (insumos/oficina/aseo/PEM). */
export function costoMensualItem(item: CostItemInput, duracionMeses: number): number {
  const total = item.cantidad * item.precioUnitario;
  if (item.modoCosto === "unico_prorrateado") {
    return total / (item.vidaUtilMeses ?? duracionMeses);
  }
  if (item.modoCosto === "unico") return total;
  return total;
}

export function totalCategoria(items: CostItemInput[], duracionMeses: number): number {
  return items.reduce((acc, i) => acc + costoMensualItem(i, duracionMeses), 0);
}

/** Módulo B.5 — EPP: consumo_mensual_item = tasaReposicion × Σdotación (calculado fuera y pasado como cantidad). */
export function calcularEppMensual(items: CostItemInput[]): number {
  return items.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0);
}

/** Módulo B.6 — Equipos y herramientas (corrección C-06: un método por cotización). */
export interface EquipoItem {
  id: string;
  descripcion: string;
  cantBase: number;
  nCuadrillas: number;
  valorUnit: number;
  vidaUtilAnios: number;
}

export function calcularDepreciacionEquipo(
  item: EquipoItem,
  metodo: "lineal" | "acelerada_y1",
) {
  const valorTotal = item.cantBase * item.nCuadrillas * item.valorUnit;
  const depAnualLineal = valorTotal / item.vidaUtilAnios;
  const depAcelerada = (valorTotal * 2) / item.vidaUtilAnios;
  const mensual = metodo === "lineal" ? depAnualLineal / 12 : depAcelerada / 12;
  return { valorTotal, depAnualLineal, depAcelerada, mensual };
}

export function totalEquipos(items: EquipoItem[], metodo: "lineal" | "acelerada_y1"): number {
  return items.reduce((acc, i) => acc + calcularDepreciacionEquipo(i, metodo).mensual, 0);
}

/** Módulo B.7 — Vehículos. */
export interface VehiculoItem {
  id: string;
  descripcion: string;
  ufMes: number;
  unidades: number;
  diasUsoMes: number;
  kmDia: number;
  rendimientoKmL: number;
  precioLitro: number;
  incluyeGps?: boolean;
}

export function calcularCostoVehiculo(item: VehiculoItem, uf: number) {
  const arriendoMes = item.ufMes * uf * item.unidades * (item.diasUsoMes / 30);
  const gpsMes = item.incluyeGps === false ? 0 : 0.8 * uf * item.unidades;
  const combustible = ((item.kmDia * 30) / item.rendimientoKmL) * item.precioLitro;
  return { arriendoMes, gpsMes, combustible, total: arriendoMes + gpsMes + combustible };
}

export function totalVehiculos(items: VehiculoItem[], uf: number): number {
  return items.reduce((acc, i) => acc + calcularCostoVehiculo(i, uf).total, 0);
}

/** Módulo B.8 — Puesta en Marcha: boleta de garantía (costo único, no mensual). */
export function calcularBoletaGarantia(montoContrato: number, tasaAnual: number, duracionMeses: number): number {
  return montoContrato * tasaAnual * (duracionMeses / 12);
}
