import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { calcularObra } from "./calculo";
import { DIVISOR_HH_DEFECTO, TIPO_OBRA, type ItemObra, type ObraInput } from "./tipos";
import type { LegalParameterSet } from "@/lib/cotizador/motor/types";
import type { CatalogoCargo } from "@/lib/cotizador/catalogo-cargos-tipos";

/**
 * Importar una propuesta ya escrita y dejarla cargada como obra, cuadrada.
 *
 * El reparto de trabajo es el mismo que en Rendir Gastos, y es lo único que hace
 * confiable a esto: **el modelo transcribe, el servidor calcula**. El modelo lee
 * el PDF y devuelve lo que está impreso —turnos, cargos, la tabla de precios, el
 * total declarado— y no calcula ni un total ni una hora-hombre. Las 552 HH, la
 * cadena de márgenes y el divisor que hace cuadrar los pone el servidor con el
 * mismo cálculo que usa el editor.
 *
 * Si el modelo se equivoca transcribiendo un monto, la verificación de abajo lo
 * detecta: la suma de las líneas tiene que dar el total declarado. Si no da, se
 * informa la discrepancia en vez de "arreglarla".
 */

function cliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en las variables de entorno. " +
        "Cargala en Vercel → Settings → Environment Variables para habilitar la importación de propuestas.",
    );
  }
  return new Anthropic();
}

const CATEGORIAS: ItemObra["categoria"][] = ["equipo_mayor", "transporte", "insumo", "servicio", "otro"];
const UNIDADES: ItemObra["unidad"][] = ["dia", "unidad", "global", "mes"];

/** Lo que el modelo transcribe del documento. Ni un número calculado. */
export interface PropuestaLeida {
  numeroOferta: string | null;
  fecha: string | null;
  cliente: string | null;
  faena: string | null;
  descripcionServicio: string;
  turnos: { cantidad: number | null; horas: number | null };
  dotacion: { cargo: string; personasPorTurno: number | null; personasTotales: number | null }[];
  trabajosPrevios: string[];
  lineasPrecio: {
    descripcion: string;
    unidad: ItemObra["unidad"];
    cantidad: number;
    precioUnitario: number;
    categoria: ItemObra["categoria"];
    /** true en la línea que cubre la cuadrilla y su trabajo, no un equipo ni un flete. */
    esManoDeObra: boolean;
  }[];
  totalNetoDeclarado: number | null;
  ilegibles: string[];
}

const ESQUEMA = {
  type: "object",
  properties: {
    numeroOferta: { type: ["string", "null"], description: "Número de oferta, ej. 'OS 009-2026'." },
    fecha: { type: ["string", "null"], description: "Fecha de la oferta en formato YYYY-MM-DD." },
    cliente: { type: ["string", "null"], description: "Razón social del cliente al que va dirigida." },
    faena: { type: ["string", "null"], description: "Faena, planta o instalación donde se ejecuta." },
    descripcionServicio: {
      type: "string",
      description: "Qué servicio es, en una línea, tal como lo titula el documento.",
    },
    turnos: {
      type: "object",
      properties: {
        cantidad: {
          type: ["number", "null"],
          description: "Cantidad de turnos del programa. null si no lo dice.",
        },
        horas: { type: ["number", "null"], description: "Horas por turno. null si no lo dice." },
      },
      required: ["cantidad", "horas"],
      additionalProperties: false,
    },
    dotacion: {
      type: "array",
      description: "Cuadro de personal. Un elemento por cargo, tal como está tabulado.",
      items: {
        type: "object",
        properties: {
          cargo: { type: "string" },
          personasPorTurno: {
            type: ["number", "null"],
            description: "Personas de ese cargo POR TURNO, solo si el documento lo dice explícitamente.",
          },
          personasTotales: {
            type: ["number", "null"],
            description: "Dotación total de ese cargo, tal como aparece en la columna del cuadro.",
          },
        },
        required: ["cargo", "personasPorTurno", "personasTotales"],
        additionalProperties: false,
      },
    },
    trabajosPrevios: {
      type: "array",
      description: "Trabajos que el documento declara ANTES de la detención de planta.",
      items: { type: "string" },
    },
    lineasPrecio: {
      type: "array",
      description: "El cuadro de precios, una entrada por ítem, con los montos EXACTOS impresos.",
      items: {
        type: "object",
        properties: {
          descripcion: { type: "string" },
          unidad: { type: "string", enum: [...UNIDADES] },
          cantidad: { type: "number" },
          precioUnitario: { type: "number", description: "Valor unitario impreso, sin puntos ni símbolo." },
          categoria: { type: "string", enum: [...CATEGORIAS] },
          esManoDeObra: {
            type: "boolean",
            description:
              "true solo si la línea cubre la cuadrilla y su trabajo (ej. 'cambio y empalme, incluye preparativos'). false para equipos, grúas, generadores, fletes e insumos.",
          },
        },
        required: ["descripcion", "unidad", "cantidad", "precioUnitario", "categoria", "esManoDeObra"],
        additionalProperties: false,
      },
    },
    totalNetoDeclarado: {
      type: ["number", "null"],
      description: "Total neto impreso al pie del cuadro de precios, sin IVA.",
    },
    ilegibles: {
      type: "array",
      description: "Datos que no se pudieron leer con certeza. No inventar ninguno.",
      items: { type: "string" },
    },
  },
  required: [
    "numeroOferta",
    "fecha",
    "cliente",
    "faena",
    "descripcionServicio",
    "turnos",
    "dotacion",
    "trabajosPrevios",
    "lineasPrecio",
    "totalNetoDeclarado",
    "ilegibles",
  ],
  additionalProperties: false,
} as const;

const INSTRUCCIONES = `Eres un asistente que TRANSCRIBE ofertas técnico-económicas de servicios industriales
para cargarlas en un cotizador. Trabajas para PERTEC (Performance Technologies), que presta servicios de
vulcanización y cambio de correas transportadoras en faenas mineras y plantas.

REGLA PRINCIPAL: transcribes, no calculas.

- Copia los montos EXACTAMENTE como están impresos. No los sumes, no los promedies, no los conviertas.
- No completes lo que no está. Si el documento no dice cuántas personas por turno, deja personasPorTurno en
  null y llena personasTotales con lo que sí dice el cuadro.
- No estimes horas-hombre. El sistema las calcula desde los turnos y la dotación.
- Todo dato que no puedas leer con certeza va nombrado en "ilegibles", nunca adivinado.

Cómo distinguir la línea de mano de obra: es la que cubre el trabajo de la cuadrilla (por ejemplo "cambio y
empalme de correa, contempla preparativos previos"). Las grúas con operador, enrolladores, generadores,
camas bajas, traslados y núcleos NO son mano de obra.

Categorías: equipo_mayor para grúas, enrolladores y generadores; transporte para traslados, movilizaciones y
camas bajas; insumo para materiales que se consumen; servicio para subcontratos de servicio; otro para el
resto.`;

export async function leerPropuesta(
  archivoBase64: string,
  mimeType: string,
  nombreArchivo: string,
): Promise<PropuestaLeida> {
  if (mimeType !== "application/pdf") {
    throw new Error(`"${nombreArchivo}" no es un PDF. La importación de propuestas acepta solo PDF.`);
  }

  const respuesta = await cliente().messages.create({
    model: "claude-sonnet-5",
    // Una propuesta tiene bastante más texto que una boleta: el cuadro de
    // precios, el cuadro de personal y el programa. 16k deja holgura para el
    // razonamiento más el JSON.
    max_tokens: 16384,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: ESQUEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: archivoBase64 },
          },
          {
            type: "text",
            text: `Transcribe esta oferta (archivo: ${nombreArchivo}) para cargarla en el cotizador.`,
          },
        ],
      },
    ],
  });

  if (respuesta.stop_reason === "refusal") {
    throw new Error(`El modelo no pudo procesar "${nombreArchivo}". Cárgala a mano como obra nueva.`);
  }
  if (respuesta.stop_reason === "max_tokens") {
    throw new Error(
      `La lectura de "${nombreArchivo}" quedó incompleta (se agotó el presupuesto de tokens). ` +
        "Cárgala a mano como obra nueva.",
    );
  }

  const texto = respuesta.content.find((b) => b.type === "text");
  if (!texto || texto.type !== "text") {
    throw new Error(`La lectura de "${nombreArchivo}" no devolvió datos.`);
  }

  return JSON.parse(texto.text) as PropuestaLeida;
}

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

  const manoDeObra = propuesta.lineasPrecio.filter((l) => l.esManoDeObra);
  const resto = propuesta.lineasPrecio.filter((l) => !l.esManoDeObra);

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
  const sumaLineas = propuesta.lineasPrecio.reduce((t, l) => t + monto(l), 0);
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
    aviso:
      diferencia === 0
        ? undefined
        : `Quedó a ${Math.abs(diferencia).toLocaleString("es-CL")} pesos del total de la oferta. ` +
          "Revisa el cuadro de precios en el editor.",
  };
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
