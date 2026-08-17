import type { MargenesConfig, PersonalSpotContratoInput } from "@/lib/cotizador/motor/types";

/**
 * SPOT por turnos ("obra"): el tercer tipo de servicio del Cotizador.
 *
 * Los dos tipos que existían razonan en MESES —`duracionMeses`, `horasBaseMes`,
 * costo empresa por persona al mes, equipos depreciados por vida útil en años—
 * porque describen un servicio con dotación en faena que se factura mensualmente.
 *
 * Una obra no es eso. Es un trabajo de horas contadas —un cambio de correa en
 * parada de planta son 4 turnos de 12 h— con una cuadrilla que entra, ejecuta y
 * se va, y donde una parte grande del precio son arriendos de equipo mayor
 * cobrados por día: grúa con operador, enrollador, generador, camas bajas. En la
 * oferta que originó este modelo, eso era el 29% del total.
 *
 * Por eso vive al lado del motor y no adentro: `lib/cotizador/motor/**` calcula
 * las cotizaciones ya emitidas y no se toca. De ahí se reutiliza lo único que
 * corresponde reutilizar —el costo empresa de una persona según la ley vigente,
 * con sus AFP, salud, impuesto y provisiones— y sobre eso se arma otra cosa.
 */

export const TIPO_OBRA = "spot_turnos" as const;

/**
 * Divisor por defecto para pasar de costo mensual a costo por hora-hombre.
 *
 * 45 es `horasBaseMes × 0,25`, la convención HH25 que el motor ya usa para el
 * refuerzo puntual de los contratos permanentes (ver personal-spot-contrato.ts).
 * Queda configurable porque es una decisión COMERCIAL, no legal: recuperar el
 * costo de un mes en 45 horas es una tarifa cargada, razonable para una
 * movilización de dos días y discutible para una obra de tres semanas. El
 * modelo no la elige por nadie.
 */
export const DIVISOR_HH_DEFECTO = 45;

export interface TurnosObra {
  /** Cuántos turnos dura la obra. En la oferta CT-6: 4. */
  cantidad: number;
  /** Horas por turno. En la oferta CT-6: 12. */
  horas: number;
}

/**
 * Un cargo de la cuadrilla.
 *
 * `personasPorTurno` y no dotación total: es lo que se puede verificar mirando
 * la obra. La dotación total sale de multiplicar por los turnos que cubre cada
 * persona, y esa multiplicación es justo la que se equivoca a mano — en la
 * oferta CT-6, 9 personas por turno y 18 en total no son dos datos, es el mismo
 * dato contado de dos formas.
 */
export interface CargoObra {
  id: string;
  cargo: string;
  personasPorTurno: number;
  /** Parámetros de remuneración, idénticos a los del refuerzo por hora-hombre. */
  remuneracion: Omit<PersonalSpotContratoInput, "id" | "cargo" | "horasEstimadasMes">;
}

/**
 * Trabajo previo a la parada de planta, en horas-hombre.
 *
 * En la oferta CT-6 son el plegado de 900 m de cinta y 4 empalmes a piso: se
 * ejecutan antes y NO consumen las 48 horas del programa, así que no pueden
 * salir de multiplicar turnos por horas. Van aparte y se valorizan con la tarifa
 * del cargo que los hace.
 */
export interface TrabajoPrevio {
  id: string;
  descripcion: string;
  cargoId: string;
  hh: number;
}

/**
 * Una línea de costo que se cobra por día o por unidad.
 *
 * Es el reemplazo de `EquipoInput`/`VehiculoInput` del motor, que valorizan por
 * depreciación y por UF/mes. Una grúa de 50 toneladas con operador por 7 días no
 * es un activo que se deprecia: es un arriendo, y su costo es el precio por día
 * por los días.
 *
 * `modo` decide de qué lado entra la plata, y es la diferencia que hace que una
 * obra cuadre o no:
 *
 *  - "costo": es un costo propio y el margen se le aplica al final, igual que al
 *    personal. Insumos, kits de empalme, lo que sale de bodega.
 *  - "precio": ya es precio al cliente y pasa derecho al total, sin margen
 *    encima. Es el caso del equipo mayor subcontratado —la grúa con operador, el
 *    enrollador, las camas bajas— que llega con la cotización del proveedor y se
 *    traspasa. Aplicarle la cadena completa de márgenes encima lo dejaría fuera
 *    de mercado, y es justo lo que hace que un modelo "prolijo" no reproduzca
 *    nunca la oferta real.
 */
export interface ItemObra {
  id: string;
  descripcion: string;
  unidad: "dia" | "unidad" | "global" | "mes";
  cantidad: number;
  precioUnitario: number;
  categoria: "equipo_mayor" | "transporte" | "insumo" | "servicio" | "otro";
  modo: "costo" | "precio";
}

export interface ObraInput {
  tipoServicio: typeof TIPO_OBRA;
  turnos: TurnosObra;
  dotacion: CargoObra[];
  trabajosPrevios: TrabajoPrevio[];
  items: ItemObra[];
  divisorHH: number;
  margenes: MargenesConfig;
  /**
   * Precio neto al que se quiere llegar, si hay uno.
   *
   * Existe porque una oferta se arma casi siempre al revés: hay un número que el
   * cliente puede pagar o que el mercado marca, y la pregunta es qué margen deja.
   * El cálculo NO lo usa para ajustarse solo —eso sería inventar un número y
   * presentarlo como calculado— sino para informar la brecha y el margen que ese
   * objetivo implica. Quien decide sigue siendo la persona.
   */
  precioObjetivo?: number;
}

export interface LineaCargoObra {
  id: string;
  cargo: string;
  personasPorTurno: number;
  personasTotales: number;
  hhTurnos: number;
  hhPrevios: number;
  hhTotal: number;
  costoUnitarioMes: number;
  costoHoraHombre: number;
  costoTotal: number;
}

export interface ObraResult {
  hhTotal: number;
  personasTotales: number;
  lineasCargo: LineaCargoObra[];
  costoPersonal: number;
  costoItems: number;
  /** Ítems en modo "precio": van al total sin margen encima. */
  preciosTraspasados: number;
  costoTotal: number;
  mob: number;
  gg: number;
  utilidad: number;
  costoCargado: number;
  ggEco: number;
  utilidadEco: number;
  /** Precio neto, sin IVA. Es el número comparable con el total de la oferta. */
  totalNeto: number;
  iva: number;
  totalConIva: number;
  /**
   * Margen sobre el trabajo propio: (totalNeto − traspasado − costoTotal) / costoTotal.
   *
   * Lo traspasado sale del numerador porque su costo no está en el denominador —
   * el modelo no lo conoce. Dejarlo dentro infla el margen sin significar nada.
   */
  margenEfectivo: number;
  /** Solo si hay `precioObjetivo`. Nada de esto altera el cálculo. */
  cuadre?: {
    objetivo: number;
    diferencia: number;
    /** Margen efectivo que tendría la obra si se vendiera al objetivo. */
    margenEfectivoObjetivo: number;
    /** Costo por hora-hombre que haría cuadrar el objetivo con estos ítems. */
    costoHoraHombreNecesario: number;
  };
}
