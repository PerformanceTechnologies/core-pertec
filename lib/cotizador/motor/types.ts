export type TipoContrato = "indefinido" | "plazo_fijo";
export type Turno = "5x2" | "4x3" | "7x7" | "14x14";
export type TipoServicio = "spot" | "contrato_permanente";
export type ModoSueldo = "base" | "liquido";

export interface TaxBracket {
  tramoN: number;
  desde: number;
  hasta: number | null;
  factor: number;
  rebaja: number;
}

export interface LegalParameterSet {
  vigenteDesde: string;
  uf: number;
  utm: number;
  ingresoMinimo: number;
  topeImponibleAfpUF: number;
  topeImponibleCesantiaUF: number;
  tasaAfp: number;
  tasaSaludLegal: number;
  tasaSisEmpleador: number;
  tasaCesantiaTrabIndefinido: number;
  tasaCesantiaEmpIndefinido: number;
  tasaCesantiaTrabPlazoFijo: number;
  tasaCesantiaEmpPlazoFijo: number;
  tasaMutualBase: number;
  aporteReformaPrevisionalEmp: number;
  topeGratificacionImmAnual: number;
  taxBrackets: TaxBracket[];
}

export interface Bono {
  nombre: string;
  monto: number;
}

export interface ProvisionesConfig {
  bonoCuatrimestralMensual?: number;
  bonoMetasMensual?: number;
  aguinaldoNavidad?: number;
  aguinaldoFiestasPatrias?: number;
  bonoNegociacion?: number;
}

export interface CostosMensualesFijos {
  eppPersona?: number;
  lavado?: number;
  traslado?: number;
  seguroRc?: number;
  celebraciones?: number;
  alojamiento?: number;
}

export interface StaffInput {
  id: string;
  cargo: string;
  clasificacion: "directo" | "indirecto";
  turno: Turno;
  dotacionA: number;
  dotacionB: number;
  dotacionContra: number;
  tipoContrato: TipoContrato;
  modoSueldo: ModoSueldo;
  base?: number;
  targetLiquido?: number;
  bonos: Bono[];
  asigMovilizacion: number;
  asigColacion: number;
  trabajaFestivos: boolean;
  pctTrabajoPesado: number;
  horasServicioDia: number;
  provisiones?: ProvisionesConfig;
  costosFijos?: CostosMensualesFijos;
  examenPreocupacionalTotal?: number;
  mesesAmortizacionExamen?: number;
}

export interface HaberesDesglose {
  base: number;
  bonos: Bono[];
  imponibleSinGrat: number;
  gratificacion: number;
  imponible1: number;
  movilizacion: number;
  colacion: number;
  remTotal: number;
}

export interface DescuentosDesglose {
  afp: number;
  salud: number;
  copagoSeguroSalud: number;
  cesantiaTrabajador: number;
  tributable: number;
  tramoAplicado: number;
  impuesto: number;
  cotizTrabajoPesado: number;
  liquida: number;
}

export interface ProvisionesDesglose {
  provFestivos: number;
  provFestivosIrrenunciable: number;
  provBonoCuatrimestral: number;
  provBonoMetas: number;
  provBonosFestivos: number;
  provAguinaldos: number;
  imponible2: number;
  remTotalPromedio: number;
}

export interface CostoEmpresaDesglose {
  seguroVida: number;
  provVacaciones: number;
  provIndemnizacion: number;
  sis: number;
  capacitacion: number;
  eppPersona: number;
  cesantiaEmpleador: number;
  seguroSaludEmpleador: number;
  mutual: number;
  aporteReforma: number;
  lavado: number;
  traslado: number;
  seguroRc: number;
  celebraciones: number;
  alojamiento: number;
  examenPreocupacional: number;
  total: number;
}

export interface StaffResult {
  id: string;
  cargo: string;
  dotacionTotal: number;
  baseUsado: number;
  haberes: HaberesDesglose;
  segundaPasada: DescuentosDesglose;
  primeraPasada: DescuentosDesglose;
  provisiones: ProvisionesDesglose;
  costoEmpresa: CostoEmpresaDesglose;
  costoUnitarioMes: number;
  costoMensualCargo: number;
  hh70: number;
  hh25: number;
  costoCargoServicio: number;
  goalSeekIterations?: number;
}

export interface AlimentacionTarifas {
  desayuno: number;
  almuerzo: number;
  cena: number;
  colacion: number;
}

export interface CostItemInput {
  id: string;
  categoria:
    | "insumo_material"
    | "insumo_oficina"
    | "util_aseo"
    | "epp"
    | "equipo_herramienta"
    | "vehiculo"
    | "puesta_en_marcha";
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  modoCosto: "mensual" | "unico_prorrateado" | "unico";
  asignacion: "directo" | "indirecto";
  vidaUtilMeses?: number;
  metodoDepreciacion?: "lineal" | "acelerada_y1";
  ufMes?: number;
  unidades?: number;
  diasUsoMes?: number;
  kmDia?: number;
  rendimientoKmL?: number;
  precioLitro?: number;
}

export interface MargenesConfig {
  mobPct: number;
  ggPct: number;
  utilidadPct: number;
  ggEcoPct: number;
  utilidadEcoPct: number;
  ivaPct: number;
  baseCalculoEco: "costo_puro" | "costo_cargado";
}

export interface EquipoInput {
  id: string;
  descripcion: string;
  cantBase: number;
  nCuadrillas: number;
  valorUnit: number;
  vidaUtilAnios: number;
  asignacion: "directo" | "indirecto";
}

export interface VehiculoInput {
  id: string;
  descripcion: string;
  ufMes: number;
  unidades: number;
  diasUsoMes: number;
  kmDia: number;
  rendimientoKmL: number;
  precioLitro: number;
  incluyeGps?: boolean;
  asignacion: "directo" | "indirecto";
}

export interface QuotationInput {
  tipoServicio: TipoServicio;
  duracionMeses: number;
  diasServicio: number;
  utilizacionPct: number;
  horasBaseMes: number;
  nCuadrillasDia: number;
  nCuadrillasNoche: number;
  factorContingencia: number;
  divisorMovilizacion: number;
  staff: StaffInput[];
  diasAlimentacionMes: number;
  tarifasAlimentacion: AlimentacionTarifas;
  costItems: CostItemInput[];
  equipos: EquipoInput[];
  metodoDepreciacionEquipos: "lineal" | "acelerada_y1";
  vehiculos: VehiculoInput[];
  montoContratoBoleta: number;
  tasaAnualBoleta: number;
  margenes: MargenesConfig;
  rxItems: { descripcion: string; cantidad: number; precioUnitario: number }[];
}
