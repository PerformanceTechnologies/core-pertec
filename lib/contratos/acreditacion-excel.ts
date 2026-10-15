import "server-only";
import writeXlsxFile from "write-excel-file/node";
import {
  CAMPOS_DE_PERSONA,
  ETIQUETAS_ETAPA,
  ETIQUETAS_WEB_CONTROL,
  estaContratada,
  fechaCorta,
  type CeldaDeDocumento,
  type Etapa,
  type TipoDocumento,
} from "./acreditacion-modelo";
import type { DatosDeContrato, PersonaAnalizada } from "./acreditacion";
import { textoDeCapacitaciones } from "./capacitaciones-modelo";
import {
  AMBAR,
  AZUL,
  AZUL_CLARO,
  BORDE,
  CELESTE,
  ENCABEZADO,
  GRIS,
  NEGRITA,
  ROJO,
  VERDE,
  celdaDeFecha,
  type Celda,
  type FilaDeExcel,
  type Hoja,
} from "./excel-comun";

type Fila = FilaDeExcel;

function celdaDeDocumento(c: CeldaDeDocumento | undefined): Celda {
  const base = { align: "center", alignVertical: "center", borderColor: BORDE } as const;
  if (!c || !c.requerido) return { ...base, value: "–", textColor: "#9ca3af" };

  switch (c.estado) {
    case "cargado":
      return { ...base, value: "X", backgroundColor: VERDE, textColor: "#166534", fontWeight: "bold" };
    case "no_aplica":
      return { ...base, value: "N/A", backgroundColor: GRIS, textColor: "#4b5563" };
    case "vencido":
      return { ...base, value: "VENC.", backgroundColor: ROJO, textColor: "#991b1b", fontWeight: "bold" };
    case "observado":
      return { ...base, value: "OBS.", backgroundColor: ROJO, textColor: "#991b1b", fontWeight: "bold" };
    default:
      // Pendiente: celda ámbar y vacía, para que lo que falta se vea sin leer.
      return { ...base, value: " ", backgroundColor: AMBAR };
  }
}

export const COLOR_ETAPA: Record<Etapa, string> = {
  documentacion: AMBAR,
  web_control: CELESTE,
  buk: CELESTE,
  acreditada: VERDE,
};

function agruparTipos(tipos: TipoDocumento[]): { grupo: string; cantidad: number }[] {
  const grupos: { grupo: string; cantidad: number }[] = [];
  for (const t of tipos) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.grupo === t.grupo) ultimo.cantidad++;
    else grupos.push({ grupo: t.grupo, cantidad: 1 });
  }
  return grupos;
}

/** La hoja que el equipo ya conoce: una fila por persona y una columna por documento. */
export function hojaDeMatriz(tipos: TipoDocumento[], personas: PersonaAnalizada[]): Hoja {
  const fijas = ["N.º", "Nombre", "RUT", "Cargo", "Faena", "Turno", "Etapa", "% avance"];
  const finales = [
    "Web Control",
    "Acreditado en WC",
    "Creado en BUK",
    "N.º de pase",
    "Estatus del pase",
    "Cursos y exámenes",
    "Contratada",
    "Fecha de ingreso",
    "Término del contrato",
    "Días para el término",
    "Observaciones",
  ];

  const grupos = agruparTipos(tipos);

  const filaDeGrupos: Fila = [];
  fijas.forEach(() => filaDeGrupos.push(null));
  for (const g of grupos) {
    filaDeGrupos.push({ ...ENCABEZADO, value: g.grupo, columnSpan: g.cantidad, backgroundColor: AZUL_CLARO });
    for (let i = 1; i < g.cantidad; i++) filaDeGrupos.push(null);
  }
  finales.forEach(() => filaDeGrupos.push(null));

  const filaDeTitulos: Fila = [
    ...fijas.map((t) => ({ ...ENCABEZADO, value: t })),
    // Los documentos en vertical, como en el Excel original: 25 columnas con el
    // nombre entero en horizontal no caben en ninguna pantalla.
    ...tipos.map((t) => ({ ...ENCABEZADO, value: t.nombre, textRotation: 90, height: 150 })),
    ...finales.map((t) => ({ ...ENCABEZADO, value: t })),
  ];

  const filas: Fila[] = [filaDeGrupos, filaDeTitulos];

  for (const { persona, cargo, analisis, cursos } of personas) {
    const termino = persona.datos.fecha_termino_2 ?? persona.datos.fecha_termino_1;
    const texto = { alignVertical: "center", borderColor: BORDE } as const;

    filas.push([
      { ...texto, value: persona.numero, align: "center" },
      { ...texto, value: persona.nombre, fontWeight: "bold" },
      { ...texto, value: persona.rut },
      { ...texto, value: cargo?.nombre ?? "—" },
      { ...texto, value: persona.datos.faena ?? "" },
      { ...texto, value: persona.datos.turno ?? "" },
      { ...texto, value: ETIQUETAS_ETAPA[analisis.etapa], backgroundColor: COLOR_ETAPA[analisis.etapa] },
      { ...texto, value: analisis.avance.porcentaje / 100, format: "0%", align: "center", fontWeight: "bold" },
      ...tipos.map((t) => celdaDeDocumento(analisis.celdas.get(t.id))),
      { ...texto, value: persona.wcAcreditado ? "Acreditado" : ETIQUETAS_WEB_CONTROL[persona.estadoWebControl] },
      { ...texto, value: persona.wcAcreditado ? "Sí" : "No", align: "center" },
      { ...texto, value: persona.creadoEnBuk ? "Sí" : "No", align: "center" },
      { ...texto, value: persona.numeroPase ?? "" },
      { ...texto, value: persona.estadoPase ?? "" },
      { ...texto, value: textoDeCapacitaciones(cursos, fechaCorta), wrap: true },
      estaContratada(persona)
        ? { ...texto, value: "Sí", align: "center", backgroundColor: VERDE }
        : { ...texto, value: "No", align: "center", backgroundColor: AMBAR },
      celdaDeFecha(persona.datos.fecha_ingreso, { ...texto, align: "center" }),
      persona.indefinido
        ? { ...texto, value: "Indefinido", align: "center" }
        : celdaDeFecha(termino, { ...texto, align: "center" }),
      analisis.diasTermino === null
        ? { ...texto, value: "" }
        : { ...texto, value: analisis.diasTermino, align: "center" },
      { ...texto, value: persona.observaciones ?? "" },
    ]);
  }

  const anchos = [
    { width: 5 },
    { width: 30 },
    { width: 13 },
    { width: 24 },
    { width: 9 },
    { width: 9 },
    { width: 18 },
    { width: 9 },
    ...tipos.map(() => ({ width: 5 })),
    { width: 30 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 16 },
    { width: 34 },
    { width: 11 },
    { width: 13 },
    { width: 13 },
    { width: 11 },
    { width: 36 },
  ];

  return { data: filas, sheet: "Acreditación", columns: anchos, stickyRowsCount: 2, stickyColumnsCount: 2, orientation: "landscape" };
}

/**
 * Los datos de las personas, una fila cada una. Los bancarios y previsionales solo si
 * `incluirBancarios`: ver generarExcel.
 */
export function hojaDeDatos(personas: PersonaAnalizada[], incluirBancarios: boolean): Hoja {
  const campos = CAMPOS_DE_PERSONA.filter(
    (c) => incluirBancarios || c.seccion !== "Bancarios y previsión",
  );

  const datos: Fila[] = [
    [
      ...["N.º", "Nombre", "RUT", "Cargo"].map((t) => ({ ...ENCABEZADO, value: t })),
      ...campos.map((c) => ({ ...ENCABEZADO, value: c.etiqueta })),
      { ...ENCABEZADO, value: "Contrato indefinido" },
    ],
    ...personas.map(({ persona, cargo }) => [
      persona.numero,
      persona.nombre,
      persona.rut,
      cargo?.nombre ?? "—",
      ...campos.map((c): Celda => {
        const valor = persona.datos[c.campo];
        if (c.tipo === "fecha") return celdaDeFecha(valor);
        // El texto como texto: un número de cuenta o un teléfono no son números
        // con los que se opere, y Excel les quitaría los ceros de la izquierda.
        return valor ?? "";
      }),
      persona.indefinido ? "Sí" : "No",
    ]),
  ];

  return {
    data: datos,
    sheet: "Datos",
    columns: [{ width: 5 }, { width: 30 }, { width: 13 }, { width: 24 }, ...campos.map(() => ({ width: 22 })), { width: 12 }],
    stickyRowsCount: 1,
    stickyColumnsCount: 2,
  };
}

/**
 * La nómina como Excel: la hoja que el equipo ya conoce, pero generada.
 *
 * `incluirBancarios` existe porque el archivo sale del core y viaja por correo.
 * Los datos de contacto y personales van en la hoja "Datos" para quien tiene el
 * módulo; los bancarios y previsionales solo cuando lo pide un administrador, que
 * es quien decide a quién se le manda una cuenta corriente.
 */
export async function generarExcel(opciones: {
  contrato: DatosDeContrato;
  tipos: TipoDocumento[];
  personas: PersonaAnalizada[];
  hoy: string;
  incluirDatos: boolean;
  incluirBancarios: boolean;
}): Promise<Buffer> {
  const { contrato, tipos, hoy, incluirDatos, incluirBancarios } = opciones;
  const personas = opciones.personas;

  // La leyenda y el resumen, en su propia hoja.
  const etapas = (Object.keys(ETIQUETAS_ETAPA) as Etapa[]).map((e) => [
    ETIQUETAS_ETAPA[e],
    personas.filter((p) => p.analisis.etapa === e).length,
  ]);

  const resumen: Fila[] = [
    [{ value: `Nómina de acreditación — ${contrato.nombre}`, fontWeight: "bold", fontSize: 14, textColor: AZUL }],
    [],
    [{ ...NEGRITA, value: "Emitida el" }, { value: fechaCorta(hoy) }],
    [{ ...NEGRITA, value: "Inicio del contrato" }, { value: fechaCorta(contrato.fechaInicio) }],
    [{ ...NEGRITA, value: "Administrador" }, { value: contrato.administrador ?? "—" }],
    [{ ...NEGRITA, value: "Personas en la nómina" }, { value: personas.length }],
    [{ ...NEGRITA, value: "De ellas, con contrato" }, { value: personas.filter((p) => estaContratada(p.persona)).length }],
    [],
    [{ ...NEGRITA, value: "Por etapa" }],
    ...etapas.map(([etapa, n]) => [{ value: etapa as string }, { value: n as number }]),
    [],
    [{ ...NEGRITA, value: "Cómo leer la hoja «Acreditación»" }],
    [{ value: "X", backgroundColor: VERDE, align: "center" }, { value: "Documento cargado y vigente" }],
    [{ value: " ", backgroundColor: AMBAR }, { value: "Pendiente: falta el documento" }],
    [{ value: "VENC.", backgroundColor: ROJO, align: "center" }, { value: "Cargado pero vencido: no cuenta para el avance" }],
    [{ value: "OBS.", backgroundColor: ROJO, align: "center" }, { value: "Observado: llegó pero hay que corregirlo" }],
    [{ value: "N/A", backgroundColor: GRIS, align: "center" }, { value: "No aplica a esta persona: sale del avance" }],
    [{ value: "–", textColor: "#9ca3af", align: "center" }, { value: "Su cargo no lo pide" }],
  ];

  const hojas: Hoja[] = [
    hojaDeMatriz(tipos, personas),
    { data: resumen, sheet: "Resumen", columns: [{ width: 34 }, { width: 50 }] },
  ];
  if (incluirDatos) hojas.push(hojaDeDatos(personas, incluirBancarios));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (writeXlsxFile as any)(hojas).toBuffer();
}
