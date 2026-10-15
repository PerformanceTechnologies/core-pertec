import "server-only";
import writeXlsxFile from "write-excel-file/node";
import { fechaCorta, type CeldaDeDocumento, type TipoDocumento } from "./acreditacion-modelo";
import {
  CAMPOS_DE_VEHICULO,
  ETIQUETAS_ETAPA_VEHICULO,
  ETIQUETAS_WEB_CONTROL_VEHICULO,
  formatearPatente,
  type EtapaVehiculo,
} from "./vehiculos-modelo";
import type { VehiculoAnalizado } from "./vehiculos";
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

const TEXTO = { alignVertical: "center", borderColor: BORDE } as const;

// Los mismos códigos que la matriz de personas y que la pantalla: el que ya sabe leer una sabe leer
// la otra.
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
      return { ...base, value: " ", backgroundColor: AMBAR };
  }
}

const COLOR_ETAPA: Record<EtapaVehiculo, string> = {
  documentacion: AMBAR,
  web_control: CELESTE,
  acreditado: VERDE,
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

/**
 * La flota como Excel: la matriz de documentos por vehículo (la hoja que el equipo ya conoce de
 * Acreditación Personas, para vehículos), un resumen con la leyenda y la hoja de datos.
 */
export async function generarExcelDeVehiculos(opciones: {
  contrato: { nombre: string; fechaInicio: string | null; administrador: string | null };
  tipos: TipoDocumento[];
  vehiculos: VehiculoAnalizado[];
  hoy: string;
}): Promise<Buffer> {
  const { contrato, tipos, hoy } = opciones;
  // Las bajas no van en lo que se manda: son historial, no flota.
  const vehiculos = opciones.vehiculos.filter((v) => v.vehiculo.activo);

  // ── Hoja 1: la matriz ──────────────────────────────────────────────────────
  const fijas = ["N.º", "Patente", "Marca y modelo", "Tipo", "Faena", "Etapa", "% avance"];
  const finales = ["Web Control", "Acreditado en WC", "Documentos vencidos", "Por vencer", "Observaciones"];
  const grupos = agruparTipos(tipos);

  const filaDeGrupos: FilaDeExcel = [];
  fijas.forEach(() => filaDeGrupos.push(null));
  for (const g of grupos) {
    filaDeGrupos.push({ ...ENCABEZADO, value: g.grupo, columnSpan: g.cantidad, backgroundColor: AZUL_CLARO });
    for (let i = 1; i < g.cantidad; i++) filaDeGrupos.push(null);
  }
  finales.forEach(() => filaDeGrupos.push(null));

  const filas: FilaDeExcel[] = [
    filaDeGrupos,
    [
      ...fijas.map((t) => ({ ...ENCABEZADO, value: t })),
      // Los documentos en vertical, como en la nómina de personas: 15 columnas con el nombre entero
      // en horizontal no caben en ninguna pantalla.
      ...tipos.map((t) => ({ ...ENCABEZADO, value: t.nombre, textRotation: 90, height: 150 })),
      ...finales.map((t) => ({ ...ENCABEZADO, value: t })),
    ],
  ];

  for (const { vehiculo, categoria, analisis } of vehiculos) {
    const marcaModelo = [vehiculo.datos.marca, vehiculo.datos.modelo].filter(Boolean).join(" ");
    filas.push([
      { ...TEXTO, value: vehiculo.numero, align: "center" },
      { ...TEXTO, value: formatearPatente(vehiculo.patente), fontWeight: "bold" },
      { ...TEXTO, value: marcaModelo },
      { ...TEXTO, value: categoria?.nombre ?? "—" },
      { ...TEXTO, value: vehiculo.datos.faena ?? "" },
      { ...TEXTO, value: ETIQUETAS_ETAPA_VEHICULO[analisis.etapa], backgroundColor: COLOR_ETAPA[analisis.etapa] },
      { ...TEXTO, value: analisis.avance.porcentaje / 100, format: "0%", align: "center", fontWeight: "bold" },
      ...tipos.map((t) => celdaDeDocumento(analisis.celdas.get(t.id))),
      { ...TEXTO, value: vehiculo.wcAcreditado ? "Acreditado" : ETIQUETAS_WEB_CONTROL_VEHICULO[vehiculo.estadoWebControl] },
      { ...TEXTO, value: vehiculo.wcAcreditado ? "Sí" : "No", align: "center" },
      { ...TEXTO, value: analisis.vencidos, align: "center", ...(analisis.vencidos > 0 ? { backgroundColor: ROJO, fontWeight: "bold" } : {}) },
      { ...TEXTO, value: analisis.porVencer, align: "center", ...(analisis.porVencer > 0 ? { backgroundColor: AMBAR } : {}) },
      { ...TEXTO, value: vehiculo.observaciones ?? "" },
    ]);
  }

  const anchos = [
    { width: 5 },
    { width: 11 },
    { width: 26 },
    { width: 18 },
    { width: 14 },
    { width: 18 },
    { width: 9 },
    ...tipos.map(() => ({ width: 5 })),
    { width: 14 },
    { width: 11 },
    { width: 11 },
    { width: 9 },
    { width: 36 },
  ];

  // ── Hoja 2: el resumen y la leyenda ────────────────────────────────────────
  const etapas = (Object.keys(ETIQUETAS_ETAPA_VEHICULO) as EtapaVehiculo[]).map((e) => [
    ETIQUETAS_ETAPA_VEHICULO[e],
    vehiculos.filter((v) => v.analisis.etapa === e).length,
  ]);
  const resumen: FilaDeExcel[] = [
    [{ value: `Flota — ${contrato.nombre}`, fontWeight: "bold", fontSize: 14, textColor: AZUL }],
    [],
    [{ ...NEGRITA, value: "Emitida el" }, { value: fechaCorta(hoy) }],
    [{ ...NEGRITA, value: "Inicio del contrato" }, { value: fechaCorta(contrato.fechaInicio) }],
    [{ ...NEGRITA, value: "Administrador" }, { value: contrato.administrador ?? "—" }],
    [{ ...NEGRITA, value: "Vehículos en la flota" }, { value: vehiculos.length }],
    [],
    [{ ...NEGRITA, value: "Por etapa" }],
    ...etapas.map(([etapa, n]) => [{ value: etapa as string }, { value: n as number }]),
    [],
    [{ ...NEGRITA, value: "Cómo leer la hoja «Flota»" }],
    [{ value: "X", backgroundColor: VERDE, align: "center" }, { value: "Documento cargado y vigente" }],
    [{ value: " ", backgroundColor: AMBAR }, { value: "Pendiente: falta el documento" }],
    [{ value: "VENC.", backgroundColor: ROJO, align: "center" }, { value: "Cargado pero vencido: no cuenta para el avance" }],
    [{ value: "OBS.", backgroundColor: ROJO, align: "center" }, { value: "Observado: llegó pero hay que corregirlo" }],
    [{ value: "N/A", backgroundColor: GRIS, align: "center" }, { value: "No aplica a este vehículo: sale del avance" }],
    [{ value: "–", textColor: "#9ca3af", align: "center" }, { value: "Su tipo de vehículo no lo pide" }],
  ];

  // ── Hoja 3: los datos de cada vehículo ─────────────────────────────────────
  const datos: FilaDeExcel[] = [
    [
      ...["N.º", "Patente", "Tipo"].map((t) => ({ ...ENCABEZADO, value: t })),
      ...CAMPOS_DE_VEHICULO.map((c) => ({ ...ENCABEZADO, value: c.etiqueta })),
    ],
    ...vehiculos.map(({ vehiculo, categoria }): FilaDeExcel => [
      vehiculo.numero,
      formatearPatente(vehiculo.patente),
      categoria?.nombre ?? "—",
      ...CAMPOS_DE_VEHICULO.map((c): Celda => {
        const valor = vehiculo.datos[c.campo];
        return c.tipo === "fecha" ? celdaDeFecha(valor) : (valor ?? "");
      }),
    ]),
  ];

  const hojas: Hoja[] = [
    { data: filas, sheet: "Flota", columns: anchos, stickyRowsCount: 2, stickyColumnsCount: 2 },
    { data: resumen, sheet: "Resumen", columns: [{ width: 34 }, { width: 50 }] },
    {
      data: datos,
      sheet: "Datos",
      columns: [{ width: 5 }, { width: 11 }, { width: 18 }, ...CAMPOS_DE_VEHICULO.map(() => ({ width: 22 }))],
      stickyRowsCount: 1,
      stickyColumnsCount: 2,
    },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (writeXlsxFile as any)(hojas).toBuffer();
}
