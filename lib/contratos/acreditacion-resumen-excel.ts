import "server-only";
import writeXlsxFile from "write-excel-file/node";
import {
  DIAS_AVISO_VENCIMIENTO,
  estaContratada,
  ETIQUETAS_ESTADO_CURSO,
  ETIQUETAS_ETAPA,
  ETIQUETAS_RESULTADO,
  ETIQUETAS_TIPO_CAPACITACION,
  fechaCorta,
  resumirDotacion,
  textoDeAlerta,
  type Alerta,
  type Cargo,
  type Etapa,
  type TipoDocumento,
} from "./acreditacion-modelo";
import type { DatosDeContrato, PersonaAnalizada } from "./acreditacion";
import { COLOR_ETAPA, hojaDeDatos, hojaDeMatriz } from "./acreditacion-excel";
import {
  horaCorta,
  ordenarEnCurso,
  registrarCapacitaciones,
  resumirCapacitaciones,
  situacionDe,
  situacionDePago,
  textoDeSituacion,
  type FacturaDeCurso,
  type RegistroDeCapacitacion,
  type Situacion,
} from "./capacitaciones-modelo";
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
  celdaDePesos,
  type Celda,
  type FilaDeExcel,
  type Hoja,
} from "./excel-comun";

// -----------------------------------------------------------------------------
//  El resumen completo de Acreditación Personas.
//
//  Un solo archivo para llevar a una reunión o mandar por correo: una portada con los números que
//  importan y, detrás, el detalle que los explica (matriz de documentos, cursos y exámenes,
//  vencimientos, documentos y dotación). Todo sale de la MISMA lectura que la pantalla
//  (`cargarNomina`): el archivo no puede decir una cosa y el core otra.
// -----------------------------------------------------------------------------

const FONDO = "#eef3fb";
const SUAVE = "#5b6b85";
const CIAN = "#37c9ef";

type Tono = "neutro" | "ok" | "aviso" | "critico";
const COLOR_DE_TONO: Record<Tono, string> = {
  neutro: AZUL,
  ok: "#15803d",
  aviso: "#b45309",
  critico: "#b91c1c",
};
const FRANJA_DE_TONO: Record<Tono, string> = {
  neutro: AZUL_CLARO,
  ok: "#22c55e",
  aviso: "#f59e0b",
  critico: "#ef4444",
};

// ── La portada, sobre una grilla de 15 columnas ────────────────────────────────
// Cuatro bloques de tres columnas separados por columnas angostas: los bloques de arriba (las
// tarjetas) y las dos tablas de abajo comparten las mismas líneas, y por eso se ven alineados.
const COLUMNAS = 15;
const ANCHOS_PORTADA = [12, 12, 12, 2, 12, 12, 12, 2, 12, 12, 12, 2, 12, 12, 12].map((width) => ({ width }));

interface Parte {
  col: number;
  celda: Celda;
  span?: number;
}

/** Una fila de la portada: lo que no se nombra queda vacío; `span` combina columnas. */
function fila(partes: Parte[], altura?: number): FilaDeExcel {
  const f: FilaDeExcel = Array.from({ length: COLUMNAS }, () => null);
  partes.forEach(({ col, celda, span }, i) => {
    const base = typeof celda === "object" && celda !== null && !(celda instanceof Date) ? celda : { value: celda };
    f[col] = {
      ...base,
      ...(span && span > 1 ? { columnSpan: span } : {}),
      // La altura de la fila la fija una sola celda.
      ...(altura && i === 0 ? { height: altura } : {}),
    };
  });
  return f;
}

const ESPACIO = (altura = 10): FilaDeExcel => fila([{ col: 0, celda: { value: "" } }], altura);

interface Tarjeta {
  etiqueta: string;
  valor: string | number;
  formato?: string;
  detalle: string;
  tono?: Tono;
}

/** Cinco filas: franja de color, etiqueta, número grande, detalle y un respiro. */
function filasDeTarjetas(tarjetas: Tarjeta[]): FilaDeExcel[] {
  const colDe = (i: number) => i * 4;
  const unir = (hacer: (t: Tarjeta, i: number) => Celda, altura: number) =>
    fila(
      tarjetas.map((t, i) => ({ col: colDe(i), celda: hacer(t, i), span: 3 })),
      altura,
    );

  return [
    unir((t) => ({ value: "", backgroundColor: FRANJA_DE_TONO[t.tono ?? "neutro"] }), 4),
    unir(
      (t) => ({
        value: t.etiqueta,
        fontSize: 8,
        fontWeight: "bold",
        textColor: SUAVE,
        backgroundColor: FONDO,
        indent: 1,
        alignVertical: "bottom",
      }),
      20,
    ),
    unir(
      (t) => ({
        value: t.valor,
        ...(t.formato ? { format: t.formato } : {}),
        fontSize: 24,
        fontWeight: "bold",
        textColor: COLOR_DE_TONO[t.tono ?? "neutro"],
        backgroundColor: FONDO,
        align: "left",
        alignVertical: "center",
        indent: 1,
      }),
      38,
    ),
    unir(
      (t) => ({
        value: t.detalle,
        fontSize: 9,
        textColor: SUAVE,
        backgroundColor: FONDO,
        indent: 1,
        alignVertical: "top",
      }),
      20,
    ),
    ESPACIO(12),
  ];
}

const ENCABEZADO_CHICO = { ...ENCABEZADO, fontSize: 9, height: 22 } as const;
const CELDA = { alignVertical: "center", borderColor: BORDE, fontSize: 10 } as const;

/** El título de una tabla de la portada: azul, con una línea cian debajo. */
function tituloDeSeccion(texto: string, col: number, span: number): Parte {
  return {
    col,
    span,
    celda: {
      value: texto.toUpperCase(),
      fontSize: 10,
      fontWeight: "bold",
      textColor: AZUL,
      bottomBorderColor: CIAN,
      bottomBorderStyle: "medium",
      alignVertical: "bottom",
    },
  };
}

/** Un porcentaje de 0 a 1 con el color del semáforo (verde ≥ 90 %, ámbar ≥ 60 %, rojo debajo). */
function celdaDeCumplimiento(valor: number | null, extras: Record<string, unknown> = {}): Celda {
  if (valor === null) return { ...extras, value: "—", align: "center", textColor: "#9ca3af" };
  const fondo = valor >= 0.9 ? VERDE : valor >= 0.6 ? AMBAR : ROJO;
  return { ...extras, value: valor, format: "0%", align: "center", backgroundColor: fondo, fontWeight: "bold" };
}

/** «██████░░░░»: una barra que se ve sin gráficos y se imprime en blanco y negro. */
function barra(porcentaje: number): string {
  const llenos = Math.max(0, Math.min(10, Math.round(porcentaje * 10)));
  return "█".repeat(llenos) + "░".repeat(10 - llenos);
}

function estadisticasDeDocumentos(tipos: TipoDocumento[], personas: PersonaAnalizada[]) {
  return tipos.map((tipo) => {
    const e = { tipo, exigido: 0, cargados: 0, pendientes: 0, observados: 0, vencidos: 0, porVencer: 0, noAplica: 0 };
    for (const p of personas) {
      const c = p.analisis.celdas.get(tipo.id);
      if (!c?.requerido) continue;
      e.exigido++;
      switch (c.estado) {
        case "cargado":
          e.cargados++;
          if (c.diasParaVencer !== null && c.diasParaVencer >= 0 && c.diasParaVencer <= DIAS_AVISO_VENCIMIENTO) {
            e.porVencer++;
          }
          break;
        case "no_aplica":
          e.noAplica++;
          break;
        case "vencido":
          e.vencidos++;
          break;
        case "observado":
          e.observados++;
          break;
        default:
          e.pendientes++;
      }
    }
    // Lo que no aplica sale del denominador, igual que en el avance de la ficha.
    const base = e.exigido - e.noAplica;
    return { ...e, cumplimiento: base > 0 ? e.cargados / base : null };
  });
}

const COLOR_DE_SITUACION: Record<Situacion, string | undefined> = {
  atrasada: ROJO,
  hoy: AMBAR,
  proxima: AMBAR,
  agendada: undefined,
  sin_fecha: GRIS,
  realizada: VERDE,
  cancelada: GRIS,
};

function generarPortada(opciones: {
  contrato: DatosDeContrato;
  tipos: TipoDocumento[];
  cargos: Cargo[];
  personas: PersonaAnalizada[];
  bajas: number;
  hoy: string;
  facturas: Map<string, FacturaDeCurso>;
}): Hoja {
  const { contrato, tipos, cargos, personas, bajas, hoy, facturas } = opciones;

  const etapas = (Object.keys(ETIQUETAS_ETAPA) as Etapa[]).map((e) => ({
    etapa: e,
    n: personas.filter((p) => p.analisis.etapa === e).length,
  }));
  const acreditadas = etapas.find((e) => e.etapa === "acreditada")?.n ?? 0;

  const totalDocs = personas.reduce((s, p) => s + p.analisis.avance.total, 0);
  const subidos = personas.reduce((s, p) => s + p.analisis.avance.subidos, 0);
  const avance = totalDocs === 0 ? 0 : subidos / totalDocs;

  const docsVencidos = personas.reduce((s, p) => s + p.analisis.vencidos, 0);
  const docsPorVencer = personas.reduce((s, p) => s + p.analisis.porVencer, 0);
  const conVencidos = personas.filter((p) => p.analisis.vencidos > 0).length;
  const conPorVencer = personas.filter((p) => p.analisis.porVencer > 0).length;
  const contratosPorTerminar = personas.filter(
    (p) => p.analisis.diasTermino !== null && p.analisis.diasTermino <= 30,
  ).length;

  const contratadas = personas.filter((p) => estaContratada(p.persona));
  const sinContrato = personas.length - contratadas.length;
  const dotacion = resumirDotacion(
    contrato.dotacionRequerida,
    cargos,
    contratadas.map((p) => ({ cargoId: p.persona.cargoId })),
    personas.map((p) => ({ cargoId: p.persona.cargoId })),
  );

  const registros = registrosDe(personas, hoy);
  const capacitaciones = resumirCapacitaciones(registros);
  // Lo facturado de cursos y exámenes: lo que ya está como gasto en Gastos de arranque (neto). Las
  // líneas anuladas no cuentan, igual que en el presupuesto.
  const vigentes = registros.flatMap((r) => {
    const fa = r.partidaGastoId ? facturas.get(r.partidaGastoId) : undefined;
    return fa && !fa.anulada && fa.monto !== null ? [fa] : [];
  });
  const facturado = vigentes.reduce((n, fa) => n + (fa.monto ?? 0), 0);
  const porPagar = vigentes.filter((fa) => !fa.pagada).reduce((n, fa) => n + (fa.monto ?? 0), 0);

  const filas: FilaDeExcel[] = [];

  // Título y subtítulo, de borde a borde.
  filas.push(
    fila(
      [
        {
          col: 0,
          span: COLUMNAS,
          celda: {
            value: "Acreditación de personas",
            fontSize: 20,
            fontWeight: "bold",
            textColor: "#ffffff",
            backgroundColor: AZUL,
            indent: 1,
            alignVertical: "center",
          },
        },
      ],
      42,
    ),
    fila(
      [
        {
          col: 0,
          span: COLUMNAS,
          celda: {
            value: [
              contrato.nombre,
              `Emitido el ${fechaCorta(hoy)}`,
              contrato.fechaInicio ? `Inicio ${fechaCorta(contrato.fechaInicio)}` : null,
              contrato.administrador ? `Administra ${contrato.administrador}` : null,
            ]
              .filter(Boolean)
              .join("   ·   "),
            fontSize: 10,
            textColor: "#ffffff",
            backgroundColor: AZUL_CLARO,
            indent: 1,
            alignVertical: "center",
          },
        },
      ],
      24,
    ),
    ESPACIO(14),
  );

  // Las ocho tarjetas, en dos filas de cuatro.
  filas.push(
    ...filasDeTarjetas([
      {
        etiqueta: "PERSONAS ACTIVAS",
        valor: personas.length,
        detalle: [
          bajas > 0 ? `${bajas} ${bajas === 1 ? "dada" : "dadas"} de baja` : "en la nómina",
          sinContrato > 0 ? `${sinContrato} sin contrato aún` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      },
      {
        etiqueta: "ACREDITADAS",
        valor: acreditadas,
        detalle: `de ${personas.length} · documentos, Web Control y BUK al día`,
        tono: personas.length > 0 && acreditadas === personas.length ? "ok" : "neutro",
      },
      {
        etiqueta: "AVANCE DOCUMENTAL",
        valor: avance,
        formato: "0%",
        detalle: `${subidos} de ${totalDocs} documentos cargados`,
        tono: avance >= 0.9 ? "ok" : avance >= 0.6 ? "aviso" : "critico",
      },
      {
        etiqueta: "DOTACIÓN",
        valor: dotacion.meta === null ? "—" : `${dotacion.contratadas} / ${dotacion.meta}`,
        detalle:
          dotacion.meta === null
            ? "sin meta definida"
            : dotacion.faltan > 0
              ? `faltan ${dotacion.faltan} por contratar`
              : "meta cumplida",
        tono: dotacion.meta === null ? "neutro" : dotacion.faltan > 0 ? "aviso" : "ok",
      },
    ]),
    ...filasDeTarjetas([
      {
        etiqueta: "DOCUMENTOS VENCIDOS",
        valor: docsVencidos,
        detalle: docsVencidos === 0 ? "ninguno" : `en ${conVencidos} ${conVencidos === 1 ? "persona" : "personas"}`,
        tono: docsVencidos > 0 ? "critico" : "ok",
      },
      {
        etiqueta: `POR VENCER (${DIAS_AVISO_VENCIMIENTO} DÍAS)`,
        valor: docsPorVencer,
        detalle: docsPorVencer === 0 ? "ninguno" : `en ${conPorVencer} ${conPorVencer === 1 ? "persona" : "personas"}`,
        tono: docsPorVencer > 0 ? "aviso" : "ok",
      },
      {
        etiqueta: "CONTRATOS POR TERMINAR",
        valor: contratosPorTerminar,
        detalle: "termina en 30 días o menos",
        tono: contratosPorTerminar > 0 ? "aviso" : "ok",
      },
      {
        etiqueta: "CURSOS Y EXÁMENES EN CURSO",
        valor: capacitaciones.enCurso,
        detalle: `${capacitaciones.atrasadas} ${capacitaciones.atrasadas === 1 ? "atrasado" : "atrasados"} · ${capacitaciones.estaSemana} esta semana`,
        tono: capacitaciones.atrasadas > 0 ? "critico" : capacitaciones.enCurso > 0 ? "aviso" : "neutro",
      },
    ]),
  );

  // ── Tabla izquierda: avance por etapa. Tabla derecha: dotación por cargo ──────
  filas.push(fila([tituloDeSeccion("Avance por etapa", 0, 7), tituloDeSeccion("Dotación por cargo", 8, 7)], 24));
  filas.push(
    fila(
      [
        { col: 0, span: 4, celda: { ...ENCABEZADO_CHICO, value: "Etapa", align: "left" } },
        { col: 4, celda: { ...ENCABEZADO_CHICO, value: "Personas" } },
        { col: 5, celda: { ...ENCABEZADO_CHICO, value: "%" } },
        { col: 6, celda: { ...ENCABEZADO_CHICO, value: "Proporción" } },
        { col: 8, span: 4, celda: { ...ENCABEZADO_CHICO, value: "Cargo", align: "left" } },
        { col: 12, celda: { ...ENCABEZADO_CHICO, value: "Meta" } },
        { col: 13, celda: { ...ENCABEZADO_CHICO, value: "Con contrato" } },
        { col: 14, celda: { ...ENCABEZADO_CHICO, value: "Faltan" } },
      ],
      22,
    ),
  );

  const lineasDeCargo = dotacion.porCargo.length > 0 ? dotacion.porCargo : [];
  const alto = Math.max(etapas.length + 1, lineasDeCargo.length + 1);
  for (let i = 0; i < alto; i++) {
    const partes: Parte[] = [];

    if (i < etapas.length) {
      const { etapa, n } = etapas[i];
      const proporcion = personas.length === 0 ? 0 : n / personas.length;
      partes.push(
        { col: 0, span: 4, celda: { ...CELDA, value: ETIQUETAS_ETAPA[etapa], backgroundColor: COLOR_ETAPA[etapa] } },
        { col: 4, celda: { ...CELDA, value: n, align: "center" } },
        { col: 5, celda: { ...CELDA, value: proporcion, format: "0%", align: "center" } },
        { col: 6, celda: { ...CELDA, value: barra(proporcion), textColor: AZUL_CLARO, fontSize: 9 } },
      );
    } else if (i === etapas.length) {
      partes.push(
        { col: 0, span: 4, celda: { ...CELDA, ...NEGRITA, value: "Total", backgroundColor: FONDO } },
        { col: 4, celda: { ...CELDA, ...NEGRITA, value: personas.length, align: "center", backgroundColor: FONDO } },
        { col: 5, celda: { ...CELDA, value: "", backgroundColor: FONDO } },
        { col: 6, celda: { ...CELDA, value: "", backgroundColor: FONDO } },
      );
    }

    if (i < lineasDeCargo.length) {
      const c = lineasDeCargo[i];
      partes.push(
        // «(+3 sin contrato)»: las registradas que aún no cuentan, para no dar a entender que no hay nadie.
        { col: 8, span: 4, celda: { ...CELDA, value: c.nombre + (c.sinContrato > 0 ? ` (+${c.sinContrato} sin contrato)` : "") } },
        { col: 12, celda: c.sinMeta ? { ...CELDA, value: "—", align: "center", textColor: "#9ca3af" } : { ...CELDA, value: c.requeridas, align: "center" } },
        { col: 13, celda: { ...CELDA, value: c.contratadas, align: "center" } },
        c.sinMeta
          ? { col: 14, celda: { ...CELDA, value: "sin meta", align: "center", textColor: "#9ca3af", fontSize: 9 } }
          : {
              col: 14,
              celda: { ...CELDA, value: c.faltan, align: "center", ...(c.faltan > 0 ? { backgroundColor: AMBAR, fontWeight: "bold" } : { backgroundColor: VERDE }) },
            },
      );
    } else if (i === lineasDeCargo.length) {
      partes.push(
        {
          col: 8,
          span: 4,
          celda: {
            ...CELDA,
            ...NEGRITA,
            backgroundColor: FONDO,
            value: dotacion.origen === "contrato" ? "Total del contrato" : dotacion.meta === null ? "Sin meta definida" : "Total",
          },
        },
        { col: 12, celda: { ...CELDA, ...NEGRITA, value: dotacion.meta ?? "—", align: "center", backgroundColor: FONDO } },
        { col: 13, celda: { ...CELDA, ...NEGRITA, value: dotacion.contratadas, align: "center", backgroundColor: FONDO } },
        { col: 14, celda: { ...CELDA, ...NEGRITA, value: dotacion.faltan, align: "center", backgroundColor: FONDO } },
      );
    }

    filas.push(fila(partes, 20));
  }

  filas.push(ESPACIO(16));

  // ── Abajo: los documentos que más faltan, y cursos y exámenes ─────────────────
  filas.push(fila([tituloDeSeccion("Documentos con más pendientes", 0, 7), tituloDeSeccion("Cursos y exámenes", 8, 7)], 24));
  filas.push(
    fila(
      [
        { col: 0, span: 4, celda: { ...ENCABEZADO_CHICO, value: "Documento", align: "left" } },
        { col: 4, celda: { ...ENCABEZADO_CHICO, value: "Faltan" } },
        { col: 5, celda: { ...ENCABEZADO_CHICO, value: "Vencidos" } },
        { col: 6, celda: { ...ENCABEZADO_CHICO, value: "Al día" } },
        { col: 8, span: 4, celda: { ...ENCABEZADO_CHICO, value: "Estado", align: "left" } },
        { col: 12, span: 3, celda: { ...ENCABEZADO_CHICO, value: "Cantidad" } },
      ],
      22,
    ),
  );

  const faltantes = estadisticasDeDocumentos(tipos, personas)
    .filter((d) => d.pendientes + d.observados + d.vencidos > 0)
    .sort((a, b) => b.pendientes + b.observados + b.vencidos - (a.pendientes + a.observados + a.vencidos))
    .slice(0, 8);

  const lineasDeCursos: [string, number, Tono?, boolean?][] = [
    ["Exámenes reservados", capacitaciones.examenesEnCurso],
    ["Cursos reservados", capacitaciones.cursosEnCurso],
    ["Atrasados (la fecha ya pasó)", capacitaciones.atrasadas, capacitaciones.atrasadas > 0 ? "critico" : undefined],
    ["Esta semana", capacitaciones.estaSemana, capacitaciones.estaSemana > 0 ? "aviso" : undefined],
    ["Reservados sin fecha", capacitaciones.sinFecha],
    ["Realizados", capacitaciones.realizadas, capacitaciones.realizadas > 0 ? "ok" : undefined],
    ["  de ellos aprobados", capacitaciones.aprobadas],
    ["  de ellos reprobados", capacitaciones.reprobadas, capacitaciones.reprobadas > 0 ? "critico" : undefined],
    ["Facturado (neto)", facturado, undefined, true],
    ["  de eso, por pagar", porPagar, porPagar > 0 ? "aviso" : undefined, true],
  ];

  const altoInferior = Math.max(faltantes.length, lineasDeCursos.length, 1);
  for (let i = 0; i < altoInferior; i++) {
    const partes: Parte[] = [];

    if (i < faltantes.length) {
      const d = faltantes[i];
      partes.push(
        { col: 0, span: 4, celda: { ...CELDA, value: d.tipo.nombre } },
        { col: 4, celda: { ...CELDA, value: d.pendientes + d.observados, align: "center", ...(d.pendientes + d.observados > 0 ? { backgroundColor: AMBAR } : {}) } },
        { col: 5, celda: { ...CELDA, value: d.vencidos, align: "center", ...(d.vencidos > 0 ? { backgroundColor: ROJO, fontWeight: "bold" } : {}) } },
        { col: 6, celda: celdaDeCumplimiento(d.cumplimiento, CELDA) },
      );
    } else if (i === 0) {
      partes.push({ col: 0, span: 7, celda: { ...CELDA, value: "No falta ningún documento.", textColor: "#15803d", fontWeight: "bold" } });
    }

    if (i < lineasDeCursos.length) {
      const [etiqueta, n, tono, enPesos] = lineasDeCursos[i];
      const realce = n > 0 && tono ? { backgroundColor: tono === "critico" ? ROJO : tono === "aviso" ? AMBAR : VERDE, fontWeight: "bold" } : {};
      partes.push(
        { col: 8, span: 4, celda: { ...CELDA, value: etiqueta } },
        {
          col: 12,
          span: 3,
          // Los montos como NÚMERO con formato de pesos: se pueden sumar y filtrar en Excel.
          celda: enPesos
            ? celdaDePesos(n, { ...CELDA, ...realce })
            : { ...CELDA, value: n, align: "center", ...realce },
        },
      );
    }

    filas.push(fila(partes, 20));
  }

  // ── Qué hay en cada hoja ──────────────────────────────────────────────────────
  filas.push(ESPACIO(16));
  filas.push(fila([tituloDeSeccion("Qué hay en este archivo", 0, COLUMNAS)], 24));
  const hojas: [string, string][] = [
    ["Acreditación", "La matriz: una fila por persona y una columna por documento (X = cargado, vacío ámbar = falta, VENC. y OBS. en rojo, N/A gris)."],
    ["Cursos y exámenes", "Cada reserva con su fecha, hora, lugar y resultado, el documento subido y la factura (N.º, monto neto, si está pagada); las atrasadas destacadas."],
    ["Vencimientos", "Lo que vence o ya venció en los próximos 30 días, los contratos por terminar y los cursos o exámenes atrasados, lo más urgente primero."],
    ["Documentos", "Cada documento del catálogo: a cuántas personas se les pide, cuántos están cargados, pendientes o vencidos."],
    ["Dotación", "Por cargo: la meta, cuántas hay contratadas y en qué etapa de la acreditación está cada una."],
  ];
  for (const [nombre, texto] of hojas) {
    filas.push(
      fila(
        [
          { col: 0, span: 3, celda: { value: nombre, fontWeight: "bold", textColor: AZUL, fontSize: 10, indent: 1, alignVertical: "center" } },
          { col: 3, span: COLUMNAS - 3, celda: { value: texto, fontSize: 10, textColor: SUAVE, alignVertical: "center" } },
        ],
        20,
      ),
    );
  }
  filas.push(ESPACIO(10));
  filas.push(fila([{ col: 0, span: COLUMNAS, celda: { value: "Generado desde Core Pertec", fontSize: 8, textColor: "#9ca3af", fontStyle: "italic", indent: 1 } }]));

  return { data: filas, sheet: "Resumen", columns: ANCHOS_PORTADA, showGridLines: false, orientation: "landscape" };
}

function registrosDe(personas: PersonaAnalizada[], hoy: string): RegistroDeCapacitacion[] {
  return registrarCapacitaciones(
    personas.map((p) => ({
      id: p.persona.id,
      nombre: p.persona.nombre,
      rut: p.persona.rut,
      cargo: p.cargo?.nombre ?? "—",
      cursos: p.cursos,
    })),
    hoy,
  );
}

// ── Hoja «Cursos y exámenes» ────────────────────────────────────────────────────
function hojaDeCapacitaciones(
  personas: PersonaAnalizada[],
  hoy: string,
  tipos: TipoDocumento[],
  facturas: Map<string, FacturaDeCurso>,
): Hoja {
  const nombreDeTipo = new Map(tipos.map((t) => [t.id, t.nombre]));
  const todos = registrosDe(personas, hoy);
  const reservados = ordenarEnCurso(todos.filter((r) => r.estado === "reservado"));
  const resto = todos
    .filter((r) => r.estado !== "reservado")
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "") || a.persona.localeCompare(b.persona, "es"));

  const titulos = ["Persona", "RUT", "Cargo", "Tipo", "Curso o examen", "Estado", "Fecha", "Hora", "Lugar o proveedor", "Resultado", "Situación", "Días", "Documento subido", "Factura N.º", "Proveedor de la factura", "Monto neto", "Pago", "Vence el pago", "Nota"];
  const filas: FilaDeExcel[] = [titulos.map((t) => ({ ...ENCABEZADO, value: t, height: 30 }))];

  for (const r of [...reservados, ...resto]) {
    const color = COLOR_DE_SITUACION[r.situacion.situacion];
    const estadoColor = r.estado === "realizado" ? VERDE : r.estado === "reservado" ? AMBAR : GRIS;
    const factura = r.partidaGastoId ? facturas.get(r.partidaGastoId) : undefined;
    const pago = factura ? situacionDePago(factura, r.facturaPlazoDias, hoy) : null;
    filas.push([
      { ...CELDA, value: r.persona, fontWeight: "bold" },
      { ...CELDA, value: r.rut },
      { ...CELDA, value: r.cargo },
      { ...CELDA, value: ETIQUETAS_TIPO_CAPACITACION[r.tipo], align: "center", backgroundColor: r.tipo === "examen" ? CELESTE : "#e0e7ff" },
      { ...CELDA, value: r.curso },
      { ...CELDA, value: ETIQUETAS_ESTADO_CURSO[r.estado], align: "center", backgroundColor: estadoColor },
      celdaDeFecha(r.fecha, { ...CELDA, align: "center" }),
      { ...CELDA, value: horaCorta(r.hora) ?? "", align: "center" },
      { ...CELDA, value: r.lugar ?? "" },
      r.resultado
        ? { ...CELDA, value: ETIQUETAS_RESULTADO[r.resultado], align: "center", backgroundColor: r.resultado === "aprobado" ? VERDE : ROJO, fontWeight: "bold" }
        : { ...CELDA, value: r.estado === "realizado" ? "Sin resultado" : "", align: "center", textColor: "#9ca3af" },
      { ...CELDA, value: textoDeSituacion(r.situacion), align: "center", ...(color ? { backgroundColor: color } : {}) },
      // Días: solo en lo que sigue reservado, que es donde sirven (negativo = atrasada).
      r.estado === "reservado" && r.situacion.dias !== null
        ? { ...CELDA, value: r.situacion.dias, align: "center", ...(r.situacion.dias < 0 ? { textColor: "#b91c1c", fontWeight: "bold" } : {}) }
        : { ...CELDA, value: "" },
      { ...CELDA, value: (r.documentoTipoId && nombreDeTipo.get(r.documentoTipoId)) || "" },
      { ...CELDA, value: factura?.referencia ?? "" },
      { ...CELDA, value: factura?.proveedor ?? "" },
      celdaDePesos(factura?.monto ?? null, CELDA),
      factura
        ? {
            ...CELDA,
            value: pago?.clave === "vencido" ? "Pago vencido" : factura.anulada ? "Anulada" : factura.pagada ? "Pagada" : "Por pagar",
            align: "center",
            backgroundColor: pago?.clave === "vencido" ? ROJO : factura.anulada ? GRIS : factura.pagada ? VERDE : AMBAR,
            ...(pago?.clave === "vencido" ? { fontWeight: "bold" } : {}),
          }
        : { ...CELDA, value: "" },
      celdaDeFecha(pago?.vence ?? null, { ...CELDA, align: "center" }),
      { ...CELDA, value: r.nota ?? "", wrap: true },
    ]);
  }

  if (todos.length === 0) {
    filas.push([{ ...CELDA, value: "Todavía no hay cursos ni exámenes anotados.", columnSpan: titulos.length, textColor: SUAVE }]);
  }

  return {
    data: filas,
    sheet: "Cursos y exámenes",
    columns: [30, 13, 24, 10, 30, 12, 12, 8, 28, 14, 18, 8, 28, 13, 28, 14, 13, 14, 40].map((width) => ({ width })),
    stickyRowsCount: 1,
    stickyColumnsCount: 1,
    orientation: "landscape",
  };
}

// ── Hoja «Vencimientos» ─────────────────────────────────────────────────────────
function hojaDeVencimientos(tipos: TipoDocumento[], personas: PersonaAnalizada[], hoy: string): Hoja {
  interface Fila {
    alerta: Alerta;
    rut: string;
    cargo: string;
    fecha: string | null;
  }
  const lista: Fila[] = [];

  for (const p of personas) {
    const base = { personaId: p.persona.id, persona: p.persona.nombre };
    const cargo = p.cargo?.nombre ?? "—";

    for (const tipo of tipos) {
      const celda = p.analisis.celdas.get(tipo.id);
      if (!celda?.requerido || celda.diasParaVencer === null || celda.diasParaVencer > DIAS_AVISO_VENCIMIENTO) continue;
      lista.push({
        alerta: { ...base, tipo: celda.diasParaVencer < 0 ? "vencido" : "por_vencer", asunto: tipo.nombre, dias: celda.diasParaVencer },
        rut: p.persona.rut,
        cargo,
        fecha: p.documentos.get(tipo.id)?.fechaVencimiento ?? null,
      });
    }

    // Cursos y exámenes reservados cuya fecha llegó o ya pasó: alguien tiene que anotar que se
    // rindieron, o reprogramarlos.
    for (const c of p.cursos) {
      if (c.estado !== "reservado") continue;
      const { situacion, dias } = situacionDe(c, hoy);
      if ((situacion !== "atrasada" && situacion !== "hoy") || dias === null) continue;
      lista.push({
        alerta: { ...base, tipo: "capacitacion", asunto: c.curso, dias },
        rut: p.persona.rut,
        cargo,
        fecha: c.fecha,
      });
    }

    if (p.analisis.diasTermino !== null && p.analisis.diasTermino <= 30) {
      lista.push({
        alerta: { ...base, tipo: "contrato", asunto: "Término del contrato", dias: p.analisis.diasTermino },
        rut: p.persona.rut,
        cargo,
        fecha: p.persona.datos.fecha_termino_2 ?? p.persona.datos.fecha_termino_1,
      });
    }
  }

  lista.sort((a, b) => a.alerta.dias - b.alerta.dias || a.alerta.persona.localeCompare(b.alerta.persona, "es"));

  const titulos = ["Prioridad", "Persona", "RUT", "Cargo", "Documento o contrato", "Fecha", "Días", "Qué pasa"];
  const filas: FilaDeExcel[] = [titulos.map((t) => ({ ...ENCABEZADO, value: t, height: 30 }))];

  const PRIORIDAD: Record<Alerta["tipo"], { texto: string; fondo: string }> = {
    vencido: { texto: "Vencido", fondo: ROJO },
    por_vencer: { texto: "Por vencer", fondo: AMBAR },
    contrato: { texto: "Contrato", fondo: CELESTE },
    capacitacion: { texto: "Curso o examen", fondo: ROJO },
  };

  for (const { alerta, rut, cargo, fecha } of lista) {
    const p = PRIORIDAD[alerta.tipo];
    filas.push([
      { ...CELDA, value: p.texto, align: "center", backgroundColor: p.fondo, fontWeight: "bold" },
      { ...CELDA, value: alerta.persona, fontWeight: "bold" },
      { ...CELDA, value: rut },
      { ...CELDA, value: cargo },
      { ...CELDA, value: alerta.asunto },
      celdaDeFecha(fecha, { ...CELDA, align: "center" }),
      { ...CELDA, value: alerta.dias, align: "center", ...(alerta.dias < 0 ? { textColor: "#b91c1c", fontWeight: "bold" } : {}) },
      { ...CELDA, value: textoDeAlerta(alerta) },
    ]);
  }

  if (lista.length === 0) {
    filas.push([{ ...CELDA, value: "No hay vencimientos ni contratos por terminar.", columnSpan: titulos.length, textColor: "#15803d", fontWeight: "bold" }]);
  }

  return {
    data: filas,
    sheet: "Vencimientos",
    columns: [12, 30, 13, 24, 32, 12, 8, 26].map((width) => ({ width })),
    stickyRowsCount: 1,
    orientation: "landscape",
  };
}

// ── Hoja «Documentos» ───────────────────────────────────────────────────────────
function hojaDeDocumentos(tipos: TipoDocumento[], personas: PersonaAnalizada[]): Hoja {
  const titulos = ["Grupo", "Documento", "Se pide a", "Cargados", "Pendientes", "Observados", "Vencidos", "Vencen en 30 días", "No aplica", "Cumplimiento"];
  const filas: FilaDeExcel[] = [titulos.map((t) => ({ ...ENCABEZADO, value: t, height: 30 }))];
  const est = estadisticasDeDocumentos(tipos, personas);

  const contar = (valor: number, extras: Record<string, unknown> = {}): Celda => ({ ...CELDA, value: valor, align: "center", ...extras });

  for (const d of est) {
    filas.push([
      { ...CELDA, value: d.tipo.grupo, textColor: SUAVE },
      { ...CELDA, value: d.tipo.nombre, fontWeight: "bold" },
      contar(d.exigido),
      contar(d.cargados),
      contar(d.pendientes, d.pendientes > 0 ? { backgroundColor: AMBAR } : {}),
      contar(d.observados, d.observados > 0 ? { backgroundColor: ROJO, fontWeight: "bold" } : {}),
      contar(d.vencidos, d.vencidos > 0 ? { backgroundColor: ROJO, fontWeight: "bold" } : {}),
      contar(d.porVencer, d.porVencer > 0 ? { backgroundColor: AMBAR } : {}),
      contar(d.noAplica),
      celdaDeCumplimiento(d.cumplimiento, CELDA),
    ]);
  }

  const suma = (campo: "exigido" | "cargados" | "pendientes" | "observados" | "vencidos" | "porVencer" | "noAplica") =>
    est.reduce((s, d) => s + d[campo], 0);
  const base = suma("exigido") - suma("noAplica");
  const total = { ...CELDA, ...NEGRITA, backgroundColor: FONDO };
  filas.push([
    { ...total, value: "Total", columnSpan: 2 },
    null,
    { ...total, value: suma("exigido"), align: "center" },
    { ...total, value: suma("cargados"), align: "center" },
    { ...total, value: suma("pendientes"), align: "center" },
    { ...total, value: suma("observados"), align: "center" },
    { ...total, value: suma("vencidos"), align: "center" },
    { ...total, value: suma("porVencer"), align: "center" },
    { ...total, value: suma("noAplica"), align: "center" },
    celdaDeCumplimiento(base > 0 ? suma("cargados") / base : null, { ...CELDA, ...NEGRITA }),
  ]);

  return {
    data: filas,
    sheet: "Documentos",
    columns: [28, 40, 11, 11, 11, 12, 11, 13, 11, 14].map((width) => ({ width })),
    stickyRowsCount: 1,
    stickyColumnsCount: 2,
    orientation: "landscape",
  };
}

// ── Hoja «Dotación» ─────────────────────────────────────────────────────────────
function hojaDeDotacion(cargos: Cargo[], personas: PersonaAnalizada[], totalDelContrato: number | null): Hoja {
  // Contratadas = activas con fecha de ingreso y sin «sin contrato aún». Las etapas de acreditación
  // sí cuentan a TODAS las de la nómina: alguien sin contrato igual avanza en sus documentos.
  const dotacion = resumirDotacion(
    totalDelContrato,
    cargos,
    personas.filter((p) => estaContratada(p.persona)).map((p) => ({ cargoId: p.persona.cargoId })),
    personas.map((p) => ({ cargoId: p.persona.cargoId })),
  );
  const etapasDe = (lista: PersonaAnalizada[]) => {
    const por: Record<Etapa, number> = { documentacion: 0, web_control: 0, buk: 0, acreditada: 0 };
    for (const p of lista) por[p.analisis.etapa]++;
    return por;
  };

  const titulos = [
    "Cargo",
    "Meta",
    "Personas en la nómina",
    "Contratadas",
    "Faltan",
    "Sobran",
    ETIQUETAS_ETAPA.documentacion,
    ETIQUETAS_ETAPA.web_control,
    ETIQUETAS_ETAPA.buk,
    ETIQUETAS_ETAPA.acreditada,
    "% acreditadas",
  ];
  const filas: FilaDeExcel[] = [titulos.map((t) => ({ ...ENCABEZADO, value: t, height: 34 }))];
  const centro = (valor: number | string, extras: Record<string, unknown> = {}): Celda => ({ ...CELDA, value: valor, align: "center", ...extras });

  const delCargo = cargos
    .filter((c) => c.activo || personas.some((p) => p.persona.cargoId === c.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  for (const c of delCargo) {
    const suyas = personas.filter((p) => p.persona.cargoId === c.id);
    const contratadasDelCargo = suyas.filter((p) => estaContratada(p.persona)).length;
    const e = etapasDe(suyas);
    const meta = c.cantidadRequerida;
    // Un cargo sin cantidad definida sale igual (con «—»): un cargo nuevo no puede quedar invisible.
    const faltan = meta === null ? null : Math.max(meta - contratadasDelCargo, 0);
    const sobran = meta === null ? null : Math.max(contratadasDelCargo - meta, 0);
    filas.push([
      { ...CELDA, value: c.nombre, fontWeight: "bold" },
      meta === null ? centro("—", { textColor: "#9ca3af" }) : centro(meta),
      centro(suyas.length),
      centro(contratadasDelCargo),
      faltan === null ? centro("—", { textColor: "#9ca3af" }) : centro(faltan, faltan > 0 ? { backgroundColor: AMBAR, fontWeight: "bold" } : { backgroundColor: VERDE }),
      sobran === null ? centro("—", { textColor: "#9ca3af" }) : centro(sobran, sobran > 0 ? { backgroundColor: CELESTE } : {}),
      centro(e.documentacion),
      centro(e.web_control),
      centro(e.buk),
      centro(e.acreditada),
      celdaDeCumplimiento(suyas.length === 0 ? null : e.acreditada / suyas.length, CELDA),
    ]);
  }

  const e = etapasDe(personas);
  const total = { ...CELDA, ...NEGRITA, backgroundColor: FONDO };
  const nCentro = (valor: number | string, extras: Record<string, unknown> = {}): Celda => ({ ...total, value: valor, align: "center", ...extras });
  filas.push([
    { ...total, value: dotacion.origen === "contrato" ? "Total del contrato" : "Total" },
    nCentro(dotacion.meta ?? "—"),
    nCentro(personas.length),
    nCentro(dotacion.contratadas),
    nCentro(dotacion.meta === null ? "—" : dotacion.faltan),
    nCentro(dotacion.meta === null ? "—" : dotacion.sobran),
    nCentro(e.documentacion),
    nCentro(e.web_control),
    nCentro(e.buk),
    nCentro(e.acreditada),
    celdaDeCumplimiento(personas.length === 0 ? null : e.acreditada / personas.length, { ...CELDA, ...NEGRITA }),
  ]);

  return {
    data: filas,
    sheet: "Dotación",
    columns: [32, 9, 14, 13, 9, 9, 16, 16, 12, 13, 14].map((width) => ({ width })),
    stickyRowsCount: 1,
    stickyColumnsCount: 1,
    orientation: "landscape",
  };
}

/**
 * El resumen completo de Acreditación Personas en un Excel.
 *
 * `personas` son las ACTIVAS: las bajas son historial y no entran en lo que se manda (el número de
 * bajas sí aparece en la portada). Los datos personales y bancarios siguen la misma regla que la
 * nómina: ver `generarExcel`.
 */
export async function generarResumenCompleto(opciones: {
  contrato: DatosDeContrato;
  tipos: TipoDocumento[];
  cargos: Cargo[];
  personas: PersonaAnalizada[];
  bajas: number;
  hoy: string;
  /** Las facturas de los cursos y exámenes, por id de su línea en Gastos de arranque. */
  facturas: Map<string, FacturaDeCurso>;
  incluirDatos: boolean;
  incluirBancarios: boolean;
}): Promise<Buffer> {
  const { contrato, tipos, cargos, personas, hoy, facturas } = opciones;

  const hojas: Hoja[] = [
    generarPortada({ contrato, tipos, cargos, personas, bajas: opciones.bajas, hoy, facturas }),
    hojaDeMatriz(tipos, personas),
    hojaDeCapacitaciones(personas, hoy, tipos, facturas),
    hojaDeVencimientos(tipos, personas, hoy),
    hojaDeDocumentos(tipos, personas),
    hojaDeDotacion(cargos, personas, contrato.dotacionRequerida),
  ];
  if (opciones.incluirDatos) hojas.push(hojaDeDatos(personas, opciones.incluirBancarios));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (writeXlsxFile as any)(hojas).toBuffer();
}
