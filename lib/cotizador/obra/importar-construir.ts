/**
 * De la transcripción de una propuesta a una obra cargable y cuadrada.
 *
 * Sin "server-only" a propósito, a diferencia de ./importar.ts: acá no hay
 * secretos ni base de datos, es aritmética y reglas. Eso permite probarlo con
 * `npx tsx` sin levantar la aplicación, y esta es justo la parte que hay que
 * poder probar — la que decide si el trabajo de la cuadrilla se cuenta una vez o
 * dos.
 */
import { calcularObra } from "./calculo";
import { DIVISOR_HH_DEFECTO, TIPO_OBRA, type ItemObra, type ObraInput } from "./tipos";
import type { LegalParameterSet } from "@/lib/cotizador/motor/types";
import type { CatalogoCargo } from "@/lib/cotizador/catalogo-cargos-tipos";
import type { PropuestaLeida } from "./importar-tipos";

export interface ObraImportada {
  obra: ObraInput;
  /** Avisos para mostrar en la UI. Nada de esto detiene la importación. */
  avisos: string[];
  /** Cifras que el servidor verificó contra el documento. */
  verificacion: {
    totalDeclarado: number | null;
    sumaLineas: number;
    cuadraConElDocumento: boolean;
    divisorAplicado: number;
    totalCalculado: number;
    diferencia: number;
  };
}

/**
 * De la transcripción a una obra cargable y cuadrada.
 *
 * Tres cosas que hace el servidor y no el modelo:
 *
 *  1. Verifica que las líneas sumen el total declarado.
 *  2. Reparte las líneas: la mano de obra NO entra como ítem —se reconstruye
 *     desde la cuadrilla— y el resto entra como precio traspasado, salvo los
 *     insumos, que son costo propio.
 *  3. Resuelve el divisor HH para que el total calculado dé exactamente el total
 *     de la oferta.
 */
export function construirObra(
  propuesta: PropuestaLeida,
  catalogo: CatalogoCargo[],
  P: LegalParameterSet,
): ObraImportada {
  const avisos: string[] = [...propuesta.ilegibles.map((i) => `El documento no era claro en: ${i}`)];

  const turnos = {
    cantidad: propuesta.turnos.cantidad ?? 1,
    horas: propuesta.turnos.horas ?? 12,
  };
  if (propuesta.turnos.cantidad === null || propuesta.turnos.horas === null) {
    avisos.push(
      "El programa de turnos no estaba explícito; se asumió 1 turno de 12 h. Corrígelo en el editor.",
    );
  }

  // Dotación por turno. Si el documento solo da el total, se reparte entre los
  // turnos que se cubren con gente distinta (día y noche = 2), que es lo que
  // significa una dotación total en una obra con turnos alternados.
  const turnosCubiertos = Math.min(Math.max(turnos.cantidad, 1), 2);
  const dotacion = propuesta.dotacion.map((d, i) => {
    let porTurno = d.personasPorTurno;
    if (porTurno === null && d.personasTotales !== null) {
      porTurno = d.personasTotales / turnosCubiertos;
      if (!Number.isInteger(porTurno)) {
        avisos.push(
          `"${d.cargo}": ${d.personasTotales} personas no se reparten enteras entre ${turnosCubiertos} turnos. ` +
            "Se dejó el número con decimales; revísalo.",
        );
      }
    }

    const plantilla = buscarEnCatalogo(d.cargo, catalogo);
    if (!plantilla) {
      avisos.push(`"${d.cargo}" no está en el catálogo de cargos: quedó con sueldo base en 0.`);
    }

    return {
      id: `c${i}`,
      cargo: d.cargo,
      personasPorTurno: porTurno ?? 1,
      remuneracion: {
        clasificacion: plantilla?.clasificacion ?? ("directo" as const),
        tipoContrato: "plazo_fijo" as const,
        modoSueldo: "base" as const,
        base: plantilla?.baseReferencial ?? 0,
        bonos: plantilla?.bonosDefault ?? [],
        asigMovilizacion: plantilla?.asigMovilizacionReferencial ?? 0,
        asigColacion: plantilla?.asigColacionReferencial ?? 0,
        trabajaFestivos: true,
        pctTrabajoPesado: 0,
      },
    };
  });

  // Los trabajos previos se cargan con su descripción y en 0 HH: el documento
  // los declara pero casi nunca los cuantifica, y poner una estimación propia
  // sería inventar horas que nadie escribió.
  const trabajosPrevios = propuesta.trabajosPrevios.map((descripcion, i) => ({
    id: `p${i}`,
    descripcion,
    cargoId: dotacion[0]?.id ?? "c0",
    hh: 0,
  }));
  if (trabajosPrevios.length > 0) {
    avisos.push(
      `${trabajosPrevios.length} trabajo(s) previo(s) quedaron en 0 horas-hombre: el documento los ` +
        "menciona sin cuantificarlos. Cárgales las HH en el editor.",
    );
  }

  // El lector se corrige a sí mismo antes de construir nada.
  //
  // Las instrucciones ya le dicen al modelo que una línea con personas adentro es
  // mano de obra aunque venga con una grúa incluida, pero una instrucción no es
  // una garantía. Esta regla sí lo es, y es aritmética:
  //
  //   si NINGUNA línea quedó marcada como mano de obra, y el documento declara un
  //   cuadro de personal, entonces el trabajo de esa gente está forzosamente
  //   dentro de alguna línea del precio. Cargarla como equipo traspasado Y además
  //   cargar la cuadrilla cuenta el mismo trabajo dos veces.
  //
  // Le pasó a la oferta OS 010-2026: una sola línea global de $15.885.200 que
  // dice "incluye Operador, Supervisor, Asesor HSEC, Rigger", marcada como
  // equipo. El total quedó en $17.820.991 — la oferta más el costo de esas mismas
  // personas otra vez.
  const lineas = corregirManoDeObra(propuesta.lineasPrecio, propuesta.dotacion.length > 0, avisos);

  const manoDeObra = lineas.filter((l) => l.esManoDeObra);
  const resto = lineas.filter((l) => !l.esManoDeObra);

  const items: ItemObra[] = resto.map((l, i) => ({
    id: `i${i}`,
    descripcion: l.descripcion,
    unidad: l.unidad,
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    categoria: l.categoria,
    // Los insumos son costo propio; el equipo mayor, el transporte y los
    // servicios llegan con la cotización del proveedor y se traspasan.
    modo: l.categoria === "insumo" ? "costo" : "precio",
  }));

  const monto = (l: { cantidad: number; precioUnitario: number }) => l.cantidad * l.precioUnitario;
  const sumaLineas = lineas.reduce((t, l) => t + monto(l), 0);
  const totalDeclarado = propuesta.totalNetoDeclarado;
  const cuadraConElDocumento = totalDeclarado !== null && Math.abs(sumaLineas - totalDeclarado) < 1;
  if (totalDeclarado !== null && !cuadraConElDocumento) {
    avisos.push(
      `Las líneas suman ${Math.round(sumaLineas).toLocaleString("es-CL")} y el documento declara ` +
        `${Math.round(totalDeclarado).toLocaleString("es-CL")}. Alguna línea se leyó mal: revisa el cuadro ` +
        "de precios antes de usar esta cotización.",
    );
  }
  if (manoDeObra.length === 0) {
    avisos.push(
      "No se identificó una línea de mano de obra: el precio objetivo quedó con el total del documento.",
    );
  }

  const base: ObraInput = {
    tipoServicio: TIPO_OBRA,
    turnos,
    dotacion,
    trabajosPrevios,
    items,
    divisorHH: DIVISOR_HH_DEFECTO,
    // El objetivo es el total de la oferta: es el número que la obra tiene que
    // reproducir. Si no viene declarado, se usa la suma de las líneas.
    precioObjetivo: totalDeclarado ?? sumaLineas,
    margenes: {
      mobPct: 0.014,
      ggPct: 0.07,
      utilidadPct: 0.1,
      ggEcoPct: 0.2,
      utilidadEcoPct: 0.2,
      ivaPct: 0.19,
      baseCalculoEco: "costo_puro",
    },
  };

  const { obra, divisorAplicado, totalCalculado, diferencia, aviso } = cuadrar(base, P);
  if (aviso) avisos.push(aviso);

  return {
    obra,
    avisos,
    verificacion: {
      totalDeclarado,
      sumaLineas: Math.round(sumaLineas),
      cuadraConElDocumento,
      divisorAplicado,
      totalCalculado,
      diferencia,
    },
  };
}

/**
 * Ajusta el divisor HH para que el total calculado dé el precio objetivo.
 *
 * Es el mismo botón "Cuadrar" del editor, aplicado una vez al importar: el
 * cálculo entrega el divisor exacto y acá se recalcula con él para confirmar que
 * el total cerró. Si no cierra —por ejemplo porque ningún cargo tiene sueldo, así
 * que no hay costo de personal que escalar— se deja el divisor por defecto y se
 * avisa, en vez de guardar un número que finge cuadrar.
 */
function cuadrar(base: ObraInput, P: LegalParameterSet) {
  const primero = calcularObra(base, P);
  const necesario = primero.cuadre?.divisorNecesario ?? 0;

  if (necesario <= 0) {
    return {
      obra: base,
      divisorAplicado: base.divisorHH,
      totalCalculado: primero.totalNeto,
      diferencia: primero.cuadre?.diferencia ?? 0,
      aviso:
        "No se pudo cuadrar automáticamente: los cargos quedaron sin sueldo base, así que no hay costo de " +
        "personal que ajustar. Carga los sueldos y usa el botón Cuadrar del editor.",
    };
  }

  const obra = { ...base, divisorHH: necesario };
  const segundo = calcularObra(obra, P);
  const diferencia = segundo.cuadre?.diferencia ?? 0;

  return {
    obra,
    divisorAplicado: necesario,
    totalCalculado: segundo.totalNeto,
    diferencia,
    aviso: avisoDelDivisor(necesario, diferencia),
  };
}

/**
 * Un divisor fuera de rango razonable significa que cuadró por la razón
 * equivocada.
 *
 * El divisor es "en cuántas horas se recupera el costo de un mes". Entre 10 y 90
 * es una carga comercial discutible pero real. Un 0,64 —el que salió importando
 * la OS-10 sin sueldos en el catálogo— no es una carga: es el sistema estirando
 * el único parámetro libre que le queda hasta llegar al total, porque los cargos
 * costaban casi nada.
 *
 * El total sigue siendo el de la oferta, así que la cotización sirve para
 * registrarla. Lo que no sirve es su desglose de costos, y eso hay que decirlo.
 */
function avisoDelDivisor(divisor: number, diferencia: number): string | undefined {
  if (diferencia !== 0) {
    return (
      `Quedó a ${Math.abs(diferencia).toLocaleString("es-CL")} pesos del total de la oferta. ` +
      "Revisa el cuadro de precios en el editor."
    );
  }
  if (divisor < 10 || divisor > 90) {
    return (
      `El total cuadra con la oferta, pero el divisor HH quedó en ${divisor.toFixed(2)}, fuera de lo ` +
      "razonable (entre 10 y 90). Pasa cuando los cargos no tienen sueldo real: el sistema estira ese " +
      "parámetro hasta llegar al total. Carga los sueldos y vuelve a apretar Cuadrar para que el desglose " +
      "de costos signifique algo."
    );
  }
  return undefined;
}

/**
 * Garantiza que el trabajo de la cuadrilla no quede contado dos veces.
 *
 * Si hay cuadro de personal pero ninguna línea del precio quedó marcada como mano
 * de obra, se marca la que la contiene. Cuál es no se adivina: con una sola línea
 * es esa, y con varias es la de mayor monto, que es la única que puede cubrir un
 * servicio completo — las líneas de equipo se cobran por día o por unidad y son
 * chicas al lado del trabajo. En los dos casos queda dicho en un aviso, porque es
 * una decisión del sistema y no del documento.
 */
function corregirManoDeObra(
  lineas: PropuestaLeida["lineasPrecio"],
  hayDotacion: boolean,
  avisos: string[],
): PropuestaLeida["lineasPrecio"] {
  if (!hayDotacion || lineas.length === 0) return lineas;
  if (lineas.some((l) => l.esManoDeObra)) return lineas;

  const monto = (l: PropuestaLeida["lineasPrecio"][number]) => l.cantidad * l.precioUnitario;
  const mayor = lineas.reduce((a, b) => (monto(b) > monto(a) ? b : a));

  avisos.push(
    `La oferta declara un cuadro de personal y ninguna línea del precio venía marcada como mano de obra. ` +
      `Se tomó "${mayor.descripcion.slice(0, 70)}" como la línea que incluye el trabajo de la cuadrilla: ` +
      "su monto pasó a ser el precio objetivo en vez de un equipo traspasado. Si no es esa, corrígelo en el " +
      "editor moviendo el ítem.",
  );

  return lineas.map((l) => (l === mayor ? { ...l, esManoDeObra: true } : l));
}

/** Match por nombre normalizado: el catálogo usa los mismos cargos que las ofertas. */
function buscarEnCatalogo(cargo: string, catalogo: CatalogoCargo[]): CatalogoCargo | undefined {
  const normalizar = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .trim();

  const buscado = normalizar(cargo);
  return (
    catalogo.find((c) => normalizar(c.cargo) === buscado) ??
    catalogo.find((c) => normalizar(c.cargo).includes(buscado) || buscado.includes(normalizar(c.cargo)))
  );
}
