import "server-only";
import writeXlsxFile from "write-excel-file/node";
import { AMBAR, AZUL, BORDE, ENCABEZADO, GRIS, NEGRITA, ROJO, VERDE, celdaDeFecha, celdaDePesos, type Celda, type FilaDeExcel, type Hoja } from "@/lib/contratos/excel-comun";
import { mesLargo } from "./reglas";
import type { LineaCentralizacion, PersonaLibro, ResumenMes } from "./remuneraciones-modelo";

// -----------------------------------------------------------------------------
//  El libro de remuneraciones en Excel: el que se le envía a Contabilidad.
//
//  Tres hojas:
//    · Libro            una fila por persona: sus haberes, descuentos, líquido, aportes del empleador y costo empresa.
//    · Resumen          los totales del mes, Previred por institución y los datos para cuadrar con la contabilidad.
//    · Centralización   el asiento del mes (cuenta, glosa, centro de costo, debe y haber).
//  Los montos van como NÚMEROS con formato: se pueden sumar, filtrar y pegar en el sistema contable.
//
//  Contiene sueldos de personas con nombre y RUT. Quién puede descargarlo y cómo queda registrado lo resuelve la ruta
//  que lo sirve (app/api/finanzas/remuneraciones/libro).
// -----------------------------------------------------------------------------

const TEXTO = { alignVertical: "center", borderColor: BORDE } as const;
const TOTAL = { fontWeight: "bold", backgroundColor: GRIS, borderColor: BORDE } as const;

export interface EntradaLibroExcel {
  empresa: string;
  periodo: string;
  /** El libro está cerrado en BUK; si no, las cifras son provisorias y el archivo lo dice. */
  cerrado: boolean;
  fechaPago: string;
  plazoPrevired: string;
  /** Hoy, para «generado el». */
  hoy: string;
  resumen: ResumenMes;
  personas: PersonaLibro[];
  centralizacion: LineaCentralizacion[];
}

const encabezado = (titulo: string, color: string = AZUL): Celda => ({ ...ENCABEZADO, value: titulo, backgroundColor: color });
const pesos = (v: number, extras: Record<string, unknown> = {}): Celda => celdaDePesos(v, { ...TEXTO, ...extras });
const conceptosOrdenados = (ps: PersonaLibro[], de: (p: PersonaLibro) => Record<string, number>): string[] => {
  const total = new Map<string, number>();
  for (const p of ps) for (const [c, m] of Object.entries(de(p))) total.set(c, (total.get(c) ?? 0) + m);
  return [...total.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).map(([c]) => c);
};

export function nombreDelArchivo(periodo: string, cerrado: boolean): string {
  return `Libro-de-remuneraciones-${periodo}${cerrado ? "" : "-PROVISORIO"}`;
}

export async function generarLibroExcel(e: EntradaLibroExcel): Promise<Buffer> {
  const hojas: Hoja[] = [hojaLibro(e), hojaResumen(e), hojaCentralizacion(e)];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (writeXlsxFile as any)(hojas).toBuffer();
}

// ── Hoja 1: el libro, una fila por persona ───────────────────────────────────

function hojaLibro(e: EntradaLibroExcel): Hoja {
  const ps = e.personas;
  const haberes = conceptosOrdenados(ps, (p) => p.haberes);
  const aportes = conceptosOrdenados(ps, (p) => p.aportes);
  const hayDiferencia = ps.some((p) => Math.abs(p.diferencia) > 1);

  const titulos: Celda[] = [
    encabezado("N.º"), encabezado("RUT"), encabezado("Nombre"), encabezado("Cargo"), encabezado("Centro de costo"), encabezado("AFP"), encabezado("Salud"),
    ...haberes.map((c) => encabezado(c, "#166534")),
    encabezado("Total haberes", "#166534"),
    encabezado("AFP (trabajador)", "#9a3412"), encabezado("Salud (trabajador)", "#9a3412"), encabezado("Seguro cesantía (trabajador)", "#9a3412"),
    encabezado("Impuesto único", "#9a3412"), encabezado("Otros descuentos", "#9a3412"), encabezado("Total descuentos", "#9a3412"),
    encabezado("LÍQUIDO A PAGAR"),
    ...aportes.map((c) => encabezado(c, "#475569")),
    encabezado("Total aportes empleador", "#475569"),
    encabezado("COSTO EMPRESA"),
    ...(hayDiferencia ? [encabezado("Control (debe ser 0)", "#991b1b")] : []),
  ];

  const filas: FilaDeExcel[] = [titulos];
  ps.forEach((p, i) => {
    filas.push([
      { ...TEXTO, value: i + 1, align: "center" },
      { ...TEXTO, value: p.rut },
      { ...TEXTO, value: p.nombre ?? "(sin nombre en BUK)", fontWeight: "bold" },
      { ...TEXTO, value: p.cargo ?? "" },
      { ...TEXTO, value: p.centros.join(" / ") },
      { ...TEXTO, value: p.afp ?? "" },
      { ...TEXTO, value: p.salud ?? "" },
      ...haberes.map((c) => pesos(p.haberes[c] ?? 0)),
      pesos(p.totalHaberes, { fontWeight: "bold" }),
      pesos(p.descuentos.afp), pesos(p.descuentos.salud), pesos(p.descuentos.cesantia), pesos(p.descuentos.impuesto), pesos(p.descuentos.otros),
      pesos(p.totalDescuentos, { fontWeight: "bold" }),
      pesos(p.liquido, { fontWeight: "bold", backgroundColor: VERDE }),
      ...aportes.map((c) => pesos(p.aportes[c] ?? 0)),
      pesos(p.totalAportes, { fontWeight: "bold" }),
      pesos(p.costoEmpresa, { fontWeight: "bold" }),
      ...(hayDiferencia ? [pesos(p.diferencia, Math.abs(p.diferencia) > 1 ? { backgroundColor: ROJO, fontWeight: "bold" } : {})] : []),
    ]);
  });

  const suma = (f: (p: PersonaLibro) => number) => ps.reduce((s, p) => s + f(p), 0);
  filas.push([
    { ...TOTAL, value: "" }, { ...TOTAL, value: "" }, { ...TOTAL, value: `TOTAL (${ps.length} ${ps.length === 1 ? "persona" : "personas"})` }, { ...TOTAL, value: "" }, { ...TOTAL, value: "" }, { ...TOTAL, value: "" }, { ...TOTAL, value: "" },
    ...haberes.map((c) => pesos(suma((p) => p.haberes[c] ?? 0), TOTAL)),
    pesos(suma((p) => p.totalHaberes), TOTAL),
    pesos(suma((p) => p.descuentos.afp), TOTAL), pesos(suma((p) => p.descuentos.salud), TOTAL), pesos(suma((p) => p.descuentos.cesantia), TOTAL),
    pesos(suma((p) => p.descuentos.impuesto), TOTAL), pesos(suma((p) => p.descuentos.otros), TOTAL), pesos(suma((p) => p.totalDescuentos), TOTAL),
    pesos(suma((p) => p.liquido), TOTAL),
    ...aportes.map((c) => pesos(suma((p) => p.aportes[c] ?? 0), TOTAL)),
    pesos(suma((p) => p.totalAportes), TOTAL),
    pesos(suma((p) => p.costoEmpresa), TOTAL),
    ...(hayDiferencia ? [pesos(suma((p) => p.diferencia), TOTAL)] : []),
  ]);

  const columnas = [6, 14, 30, 26, 18, 14, 14, ...haberes.map(() => 14), 15, 14, 14, 16, 14, 14, 15, 16, ...aportes.map(() => 14), 16, 16, ...(hayDiferencia ? [14] : [])];
  return { data: filas, sheet: "Libro", columns: columnas.map((width) => ({ width })), stickyRowsCount: 1, stickyColumnsCount: 3, orientation: "landscape" };
}

// ── Hoja 2: el resumen del mes ────────────────────────────────────────────────

function hojaResumen(e: EntradaLibroExcel): Hoja {
  const r = e.resumen;
  const par = (etiqueta: string, valor: Celda): FilaDeExcel => [{ ...NEGRITA, value: etiqueta }, valor];
  const totalHaberes = e.personas.reduce((s, p) => s + p.totalHaberes, 0);
  const totalDescuentos = e.personas.reduce((s, p) => s + p.totalDescuentos, 0);
  const totalAportes = e.personas.reduce((s, p) => s + p.totalAportes, 0);

  const filas: FilaDeExcel[] = [
    [{ value: `Libro de remuneraciones — ${mesLargo(`${e.periodo}-01`)}`, fontWeight: "bold", fontSize: 14, textColor: AZUL }],
    [{ value: e.empresa }],
    [],
    ...(e.cerrado ? [] : [[{ value: "PROVISORIO: el libro de este mes sigue abierto en BUK y las cifras pueden cambiar.", fontWeight: "bold", backgroundColor: AMBAR }] as FilaDeExcel, []]),
    par("Generado el", celdaDeFecha(e.hoy, { align: "left" })),
    par("Estado del libro en BUK", { value: e.cerrado ? "Cerrado" : "Abierto (provisorio)", ...(e.cerrado ? {} : { backgroundColor: AMBAR }) }),
    par("Fecha de pago de sueldos", celdaDeFecha(e.fechaPago, { align: "left" })),
    par("Plazo de referencia Previred", celdaDeFecha(e.plazoPrevired, { align: "left" })),
    par("Personas", { value: r.personas, align: "left" }),
    [],
    [{ ...NEGRITA, value: "Del sueldo al líquido" }],
    par("Total haberes", celdaDePesos(totalHaberes)),
    par("− Descuentos (AFP, salud, cesantía, impuesto, otros)", celdaDePesos(totalDescuentos)),
    par("= Líquido a pagar", celdaDePesos(r.liquido, { fontWeight: "bold", backgroundColor: VERDE })),
    [],
    [{ ...NEGRITA, value: "Costo para la empresa" }],
    par("Total haberes", celdaDePesos(totalHaberes)),
    par("+ Aportes del empleador", celdaDePesos(totalAportes)),
    par("= Costo empresa", celdaDePesos(r.costoEmpresa, { fontWeight: "bold" })),
    [],
    [{ ...NEGRITA, value: "A pagar a terceros" }],
    par("Líquido a las personas", celdaDePesos(r.liquido)),
    par("Previred (AFP, salud, cesantía, mutual, caja)", celdaDePesos(r.previred)),
    par("Impuesto único (va en el F29)", celdaDePesos(r.impuesto)),
    ...(r.otros !== 0 ? [par("Otros", celdaDePesos(r.otros))] : []),
    [],
    [{ ...NEGRITA, value: "Previred por institución" }],
    ...r.previsional.flatMap((g): FilaDeExcel[] => [
      [{ ...NEGRITA, value: g.grupo, backgroundColor: GRIS }, celdaDePesos(g.monto, { fontWeight: "bold", backgroundColor: GRIS })],
      ...(g.detalle.length > 1 ? g.detalle.map((d): FilaDeExcel => [{ value: `   ${d.concepto}` }, celdaDePesos(d.monto)]) : []),
    ]),
    [],
    [{ ...NEGRITA, value: "Control" }],
    par("Debe y haber de la centralización", { value: r.cuadra ? "Cuadran" : `NO cuadran (diferencia ${Math.round(r.diferencia).toLocaleString("es-CL")})`, backgroundColor: r.cuadra ? VERDE : ROJO, fontWeight: "bold" }),
    par("Personas con control distinto de 0", { value: e.personas.filter((p) => Math.abs(p.diferencia) > 1).length, align: "left" }),
  ];
  return { data: filas, sheet: "Resumen", columns: [{ width: 52 }, { width: 22 }], showGridLines: false };
}

// ── Hoja 3: la centralización contable ────────────────────────────────────────

function hojaCentralizacion(e: EntradaLibroExcel): Hoja {
  const filas: FilaDeExcel[] = [[encabezado("Cuenta"), encabezado("Glosa"), encabezado("Centro de costo"), encabezado("Debe"), encabezado("Haber")]];
  for (const l of e.centralizacion) {
    filas.push([
      { ...TEXTO, value: l.cuenta },
      { ...TEXTO, value: l.glosa },
      { ...TEXTO, value: l.centro },
      l.debe ? pesos(l.debe) : { ...TEXTO, value: "" },
      l.haber ? pesos(l.haber) : { ...TEXTO, value: "" },
    ]);
  }
  const debe = e.centralizacion.reduce((s, l) => s + l.debe, 0);
  const haber = e.centralizacion.reduce((s, l) => s + l.haber, 0);
  filas.push([{ ...TOTAL, value: "" }, { ...TOTAL, value: "TOTAL" }, { ...TOTAL, value: "" }, pesos(debe, TOTAL), pesos(haber, TOTAL)]);
  return { data: filas, sheet: "Centralización", columns: [{ width: 12 }, { width: 40 }, { width: 18 }, { width: 16 }, { width: 16 }], stickyRowsCount: 1 };
}
