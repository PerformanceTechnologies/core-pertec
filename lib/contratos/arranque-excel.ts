import "server-only";
import writeXlsxFile from "write-excel-file/node";
import { fechaCorta } from "./acreditacion-modelo";
import {
  MODULOS,
  etiquetaDeEstadoDePartida,
  faseDe,
  type Categoria,
  type ModuloArranque,
  type Partida,
} from "./arranque-modelo";
import {
  ETIQUETAS_DE_COTIZACION,
  ETIQUETAS_DE_MODALIDAD,
  analizarCotizaciones,
  comprometidoDe,
  masBarataDeLinea,
  mejorCotizacionDeLinea,
  pagadoDe,
  porComprometerDe,
  type Cotizacion,
  type ResumenDePresupuesto,
} from "./gastos-modelo";
import {
  AMBAR,
  AZUL,
  CELESTE,
  ENCABEZADO,
  GRIS,
  NEGRITA,
  ROJO,
  VERDE,
  BORDE,
  celdaDeFecha,
  celdaDePesos,
  celdaDePorcentaje,
  type Celda,
  type FilaDeExcel,
  type Hoja,
} from "./excel-comun";

const TEXTO = { alignVertical: "center", borderColor: BORDE } as const;

/** El color de la celda de estado según la fase: hecho en verde, en curso en celeste, fuera en gris. */
function colorDeEstado(modulo: ModuloArranque, estado: string): string {
  const fase = faseDe(modulo, estado);
  return fase === "final" ? VERDE : fase === "curso" ? CELESTE : fase === "fuera" ? GRIS : AMBAR;
}

function encabezados(titulos: string[]): FilaDeExcel {
  return titulos.map((t) => ({ ...ENCABEZADO, value: t }));
}

interface Entrada {
  modulo: ModuloArranque;
  contrato: string;
  hoy: string;
  partidas: Partida[];
  /** Las partidas del OTRO módulo, solo para nombrar el vínculo («Despacho a Calama»). */
  otras: Partida[];
  categorias: Categoria[];
  /** id → nombre de quien responde (usuarios del core y contrapartes externas). */
  responsables: Map<string, string>;
  /** Solo Gastos. */
  gastos?: {
    presupuesto: ResumenDePresupuesto;
    cotizaciones: Cotizacion[];
    cambios: { anterior: number | null; nuevo: number | null; motivo: string | null; usuario: string; en: string }[];
  };
}

/**
 * Logística o Gastos de arranque como Excel.
 *
 * Gastos sale con cuatro hojas pensadas para quien lo recibe sin abrir el core: el RESUMEN del
 * presupuesto, el reparto por ÍTEM, las LÍNEAS y todas las COTIZACIONES lado a lado. Los montos son
 * números con formato (se pueden sumar y filtrar), no texto. Logística sale con su lista de
 * requerimientos y un resumen.
 */
export async function generarExcelDeArranque(e: Entrada): Promise<Buffer> {
  return e.modulo === "gastos" && e.gastos ? await gastos(e, e.gastos) : await logistica(e);
}

function nombreDeResponsable(e: Entrada, id: string | null, idExterno: string | null): string {
  return (id && e.responsables.get(id)) || (idExterno && e.responsables.get(idExterno)) || "";
}

function vinculo(e: Entrada, p: Partida, todas: Map<string, Partida>): string {
  if (!p.partidaVinculadaId) return "";
  const otra = todas.get(p.partidaVinculadaId);
  return otra ? `${String(otra.numero).padStart(4, "0")} · ${otra.descripcion}` : "";
}

// ── Logística ────────────────────────────────────────────────────────────────

async function logistica(e: Entrada): Promise<Buffer> {
  const config = MODULOS.logistica;
  const nombreCategoria = new Map(e.categorias.map((c) => [c.id, c.nombre]));
  const porId = new Map([...e.partidas, ...e.otras].map((p) => [p.id, p]));

  const filas: FilaDeExcel[] = [
    encabezados([
      "N.º",
      "Categoría",
      "Requerimiento",
      "Proveedor",
      "Estado",
      config.etiquetaFecha,
      "Días para la fecha",
      config.etiquetaPresupuesto,
      config.etiquetaReal,
      config.etiquetaReferencia,
      "Responsable",
      "Gasto relacionado",
      "Notas",
    ]),
  ];

  const hoyMs = Date.parse(`${e.hoy}T00:00:00Z`);
  for (const p of [...e.partidas].sort((a, b) => a.numero - b.numero)) {
    const dias = p.fecha ? Math.round((Date.parse(`${p.fecha}T00:00:00Z`) - hoyMs) / 86_400_000) : null;
    const hecho = faseDe("logistica", p.estado) === "final";
    const fuera = faseDe("logistica", p.estado) === "fuera";
    const atrasado = dias !== null && dias < 0 && !hecho && !fuera;

    filas.push([
      { ...TEXTO, value: p.numero, align: "center" },
      { ...TEXTO, value: nombreCategoria.get(p.categoriaId) ?? "—" },
      { ...TEXTO, value: p.descripcion, fontWeight: "bold" },
      { ...TEXTO, value: p.proveedor ?? "" },
      { ...TEXTO, value: etiquetaDeEstadoDePartida("logistica", p.estado), backgroundColor: colorDeEstado("logistica", p.estado) },
      celdaDeFecha(p.fecha, { ...TEXTO, align: "center", ...(atrasado ? { backgroundColor: ROJO } : {}) }),
      dias === null || hecho || fuera ? { ...TEXTO, value: "" } : { ...TEXTO, value: dias, align: "center", ...(atrasado ? { backgroundColor: ROJO, fontWeight: "bold" } : {}) },
      celdaDePesos(p.montoPresupuestado, TEXTO),
      celdaDePesos(p.montoReal, TEXTO),
      { ...TEXTO, value: p.referencia ?? "" },
      { ...TEXTO, value: nombreDeResponsable(e, p.responsableId, p.responsableExternoId) },
      { ...TEXTO, value: vinculo(e, p, porId) },
      { ...TEXTO, value: p.notas ?? "", wrap: true },
    ]);
  }

  const vivas = e.partidas.filter((p) => faseDe("logistica", p.estado) !== "fuera");
  const hechas = vivas.filter((p) => faseDe("logistica", p.estado) === "final").length;
  const atrasadas = vivas.filter((p) => {
    if (faseDe("logistica", p.estado) === "final" || !p.fecha) return false;
    return Date.parse(`${p.fecha}T00:00:00Z`) < hoyMs;
  }).length;

  const resumen: FilaDeExcel[] = [
    [{ value: `Logística — ${e.contrato}`, fontWeight: "bold", fontSize: 14, textColor: AZUL }],
    [],
    [{ ...NEGRITA, value: "Emitida el" }, { value: fechaCorta(e.hoy) }],
    [{ ...NEGRITA, value: "Requerimientos (sin cancelados)" }, { value: vivas.length }],
    [{ ...NEGRITA, value: "Ejecutados" }, { value: hechas }],
    [{ ...NEGRITA, value: "Avance" }, celdaDePorcentaje(vivas.length === 0 ? 0 : hechas / vivas.length, NEGRITA)],
    [{ ...NEGRITA, value: "Atrasados" }, { value: atrasadas, ...(atrasadas > 0 ? { backgroundColor: ROJO, fontWeight: "bold" } : {}) }],
    [],
    [{ ...NEGRITA, value: "Por estado" }],
    ...config.estados.map((s) => [
      { value: s.etiqueta, backgroundColor: colorDeEstado("logistica", s.clave) },
      { value: e.partidas.filter((p) => p.estado === s.clave).length },
    ]),
  ];

  const hojas: Hoja[] = [
    {
      data: filas,
      sheet: "Requerimientos",
      columns: [{ width: 6 }, { width: 24 }, { width: 40 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 11 }, { width: 15 }, { width: 15 }, { width: 18 }, { width: 22 }, { width: 34 }, { width: 40 }],
      stickyRowsCount: 1,
      stickyColumnsCount: 3,
    },
    { data: resumen, sheet: "Resumen", columns: [{ width: 34 }, { width: 18 }] },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (writeXlsxFile as any)(hojas).toBuffer();
}

// ── Gastos ───────────────────────────────────────────────────────────────────

async function gastos(e: Entrada, g: NonNullable<Entrada["gastos"]>): Promise<Buffer> {
  const config = MODULOS.gastos;
  const r = g.presupuesto;
  const nombreCategoria = new Map(e.categorias.map((c) => [c.id, c.nombre]));
  const porId = new Map([...e.partidas, ...e.otras].map((p) => [p.id, p]));

  const cotizacionesPorLinea = new Map<string, Cotizacion[]>();
  for (const c of g.cotizaciones) {
    const lista = cotizacionesPorLinea.get(c.partidaId) ?? [];
    lista.push(c);
    cotizacionesPorLinea.set(c.partidaId, lista);
  }

  // ── Hoja 1: el resumen ────────────────────────────────────────────────────
  const par = (etiqueta: string, valor: Celda): FilaDeExcel => [
    { ...NEGRITA, value: etiqueta },
    valor !== null && typeof valor === "object" && !(valor instanceof Date) ? valor : { value: valor as string | number | boolean | Date | null },
  ];
  const resumen: FilaDeExcel[] = [
    [{ value: `Gastos de arranque — ${e.contrato}`, fontWeight: "bold", fontSize: 14, textColor: AZUL }],
    [{ value: "Todos los montos en pesos chilenos, neto (sin IVA).", textColor: "#6b7280" }],
    [],
    par("Emitido el", fechaCorta(e.hoy)),
    [],
    [{ ...NEGRITA, value: "Presupuesto" }],
    par("Presupuesto total vigente", celdaDePesos(r.total, NEGRITA)),
    par("Presupuesto original", celdaDePesos(r.original)),
    par("Asignado a ítems", celdaDePesos(r.asignado)),
    par("Sin repartir", celdaDePesos(r.sinRepartir, r.sinRepartir !== null && r.sinRepartir < 0 ? { backgroundColor: ROJO } : {})),
    [],
    [{ ...NEGRITA, value: "Gasto" }],
    par("Comprometido (aprobado u OC)", celdaDePesos(r.comprometido, NEGRITA)),
    par("Pagado", celdaDePesos(r.pagado)),
    par("Por comprometer (mejor cotización o estimado)", celdaDePesos(r.porComprometer)),
    par("Proyectado", celdaDePesos(r.proyectado, r.enRiesgo ? { backgroundColor: ROJO, fontWeight: "bold" } : NEGRITA)),
    par("Disponible (total − comprometido)", celdaDePesos(r.disponible, r.disponible !== null && r.disponible < 0 ? { backgroundColor: ROJO } : {})),
    par("Disponible proyectado", celdaDePesos(r.disponibleProyectado, r.enRiesgo ? { backgroundColor: ROJO, fontWeight: "bold" } : {})),
    par("Ahorro por comparar cotizaciones", celdaDePesos(r.ahorroLogrado, r.ahorroLogrado > 0 ? { backgroundColor: VERDE } : {})),
    [],
    [{ ...NEGRITA, value: "Líneas por estado" }],
    ...config.estados.map((s): FilaDeExcel => [
      { value: s.etiqueta, backgroundColor: colorDeEstado("gastos", s.clave) },
      { value: e.partidas.filter((p) => p.estado === s.clave).length },
    ]),
  ];
  if (g.cambios.length > 0) {
    resumen.push([], [{ ...NEGRITA, value: "Cambios del presupuesto" }]);
    for (const c of g.cambios) {
      resumen.push([
        { value: `${fechaCorta(c.en.slice(0, 10))} · ${c.usuario}` },
        celdaDePesos(c.nuevo),
        { value: c.motivo ?? "" },
      ]);
    }
  }

  // ── Hoja 2: por ítem ──────────────────────────────────────────────────────
  const items: FilaDeExcel[] = [
    encabezados(["Ítem", "Presupuesto", "Comprometido", "Pagado", "Por comprometer", "Proyectado", "% proyectado", "Líneas", "Situación"]),
    ...r.items
      .filter((i) => i.lineas > 0 || i.presupuesto !== null)
      .map((i): FilaDeExcel => {
        const pct = i.presupuesto && i.presupuesto > 0 ? i.proyectado / i.presupuesto : null;
        return [
          { ...TEXTO, value: i.nombre, fontWeight: "bold" },
          celdaDePesos(i.presupuesto, TEXTO),
          celdaDePesos(i.comprometido, TEXTO),
          celdaDePesos(i.pagado, TEXTO),
          celdaDePesos(i.porComprometer, TEXTO),
          celdaDePesos(i.proyectado, { ...TEXTO, fontWeight: "bold" }),
          celdaDePorcentaje(pct, TEXTO),
          { ...TEXTO, value: i.lineas, align: "center" },
          i.presupuesto === null
            ? { ...TEXTO, value: "Sin presupuesto" }
            : i.sobre
              ? { ...TEXTO, value: "Sobre el presupuesto", backgroundColor: ROJO, fontWeight: "bold" }
              : { ...TEXTO, value: "Dentro", backgroundColor: VERDE },
        ];
      }),
  ];

  // ── Hoja 3: las líneas ────────────────────────────────────────────────────
  const lineas: FilaDeExcel[] = [
    encabezados([
      "N.º", "Ítem", "Línea", "Cantidad", "Cómo se compra", "Estado", "Proveedor", "Referencia (OC / factura)",
      "Estimado", "Cotización más barata", "Comprometido", "Pagado", "Por comprometer", "Fecha", "Responsable",
      "Requerimiento de logística", "Cotizaciones", "Notas",
    ]),
  ];
  for (const p of [...e.partidas].sort((a, b) => a.numero - b.numero)) {
    const mejor = mejorCotizacionDeLinea(cotizacionesPorLinea.get(p.id) ?? []);
    const linea = {
      categoriaId: p.categoriaId,
      estado: p.estado,
      montoPresupuestado: p.montoPresupuestado,
      montoReal: p.montoReal,
      montoComprometido: p.montoComprometido,
      mejorCotizacionClp: mejor,
    };
    lineas.push([
      { ...TEXTO, value: p.numero, align: "center" },
      { ...TEXTO, value: nombreCategoria.get(p.categoriaId) ?? "—" },
      { ...TEXTO, value: p.descripcion, fontWeight: "bold" },
      { ...TEXTO, value: p.cantidad, align: "center" },
      { ...TEXTO, value: ETIQUETAS_DE_MODALIDAD[p.modalidad] },
      { ...TEXTO, value: etiquetaDeEstadoDePartida("gastos", p.estado), backgroundColor: colorDeEstado("gastos", p.estado) },
      { ...TEXTO, value: p.proveedor ?? "" },
      { ...TEXTO, value: p.referencia ?? "" },
      celdaDePesos(p.montoPresupuestado, TEXTO),
      celdaDePesos(masBarataDeLinea(cotizacionesPorLinea.get(p.id) ?? []), TEXTO),
      celdaDePesos(comprometidoDe(linea), TEXTO),
      celdaDePesos(pagadoDe(linea), TEXTO),
      celdaDePesos(porComprometerDe(linea), TEXTO),
      celdaDeFecha(p.fecha, { ...TEXTO, align: "center" }),
      { ...TEXTO, value: nombreDeResponsable(e, p.responsableId, p.responsableExternoId) },
      { ...TEXTO, value: vinculo(e, p, porId) },
      { ...TEXTO, value: (cotizacionesPorLinea.get(p.id) ?? []).length, align: "center" },
      { ...TEXTO, value: p.notas ?? "", wrap: true },
    ]);
  }

  // ── Hoja 4: las cotizaciones ──────────────────────────────────────────────
  const cotizaciones: FilaDeExcel[] = [
    encabezados([
      "Línea N.º", "Línea", "Proveedor", "Qué cotizó", "Estado", "Cantidad", "Moneda", "Precio unitario (neto)",
      "Tipo de cambio", "Total en pesos (neto)", "Es la más barata", "% sobre la más barata", "Plazo de entrega (días)",
      "Garantía", "Condiciones de pago", "Precio vigente hasta", "Respuesta esperada para", "Por qué se eligió / descartó",
      "Por confirmar antes de la OC", "Aprobada por", "Aprobada el", "Notas",
    ]),
  ];
  const lineasOrdenadas = [...e.partidas].sort((a, b) => a.numero - b.numero);
  for (const p of lineasOrdenadas) {
    const lista = cotizacionesPorLinea.get(p.id) ?? [];
    if (lista.length === 0) continue;
    const { filas } = analizarCotizaciones(lista, { hoy: e.hoy, fechaLimite: null });
    for (const f of filas) {
      const c = f.cotizacion;
      const color =
        c.estado === "aprobada" ? VERDE : c.estado === "descartada" ? GRIS : c.estado === "solicitada" ? AMBAR : CELESTE;
      cotizaciones.push([
        { ...TEXTO, value: p.numero, align: "center" },
        { ...TEXTO, value: p.descripcion },
        { ...TEXTO, value: c.proveedor, fontWeight: "bold" },
        { ...TEXTO, value: c.descripcion ?? "" },
        { ...TEXTO, value: ETIQUETAS_DE_COTIZACION[c.estado], backgroundColor: color },
        { ...TEXTO, value: c.cantidad, align: "center" },
        { ...TEXTO, value: c.moneda, align: "center" },
        c.precioUnitario === null
          ? { ...TEXTO, value: "" }
          : { ...TEXTO, value: c.precioUnitario, format: c.moneda === "CLP" ? "$#,##0" : "#,##0.00", align: "right" },
        c.moneda === "CLP" ? { ...TEXTO, value: "" } : { ...TEXTO, value: c.tipoCambio, format: "#,##0.00", align: "right" },
        celdaDePesos(c.totalClp, { ...TEXTO, fontWeight: "bold" }),
        { ...TEXTO, value: f.esLaMasBarata ? "Sí" : "", align: "center", ...(f.esLaMasBarata ? { backgroundColor: VERDE } : {}) },
        f.masCaraPct !== null && f.masCaraPct > 0 ? { ...TEXTO, value: f.masCaraPct / 100, format: "0%", align: "center" } : { ...TEXTO, value: "" },
        c.plazoEntregaDias === null ? { ...TEXTO, value: "" } : { ...TEXTO, value: c.plazoEntregaDias, align: "center" },
        { ...TEXTO, value: c.garantia ?? "" },
        { ...TEXTO, value: c.condicionesPago ?? "" },
        celdaDeFecha(c.vigenciaHasta, { ...TEXTO, align: "center" }),
        celdaDeFecha(c.respuestaEsperada, { ...TEXTO, align: "center" }),
        { ...TEXTO, value: c.motivoDecision ?? "", wrap: true },
        { ...TEXTO, value: c.porConfirmar ?? "", wrap: true },
        { ...TEXTO, value: c.aprobadoPorNombre ?? "" },
        celdaDeFecha(c.aprobadoEn?.slice(0, 10), { ...TEXTO, align: "center" }),
        { ...TEXTO, value: c.notas ?? "", wrap: true },
      ]);
    }
  }

  const hojas: Hoja[] = [
    { data: resumen, sheet: "Resumen", columns: [{ width: 46 }, { width: 20 }, { width: 40 }] },
    { data: items, sheet: "Ítems", columns: [{ width: 32 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 8 }, { width: 22 }], stickyRowsCount: 1, stickyColumnsCount: 1 },
    {
      data: lineas,
      sheet: "Líneas",
      columns: [{ width: 6 }, { width: 26 }, { width: 40 }, { width: 9 }, { width: 16 }, { width: 18 }, { width: 22 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 22 }, { width: 34 }, { width: 11 }, { width: 40 }],
      stickyRowsCount: 1,
      stickyColumnsCount: 3,
    },
    {
      data: cotizaciones,
      sheet: "Cotizaciones",
      columns: [{ width: 8 }, { width: 32 }, { width: 22 }, { width: 34 }, { width: 13 }, { width: 9 }, { width: 8 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 11 }, { width: 12 }, { width: 11 }, { width: 14 }, { width: 24 }, { width: 13 }, { width: 13 }, { width: 38 }, { width: 38 }, { width: 18 }, { width: 13 }, { width: 38 }],
      stickyRowsCount: 1,
      stickyColumnsCount: 3,
    },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (writeXlsxFile as any)(hojas).toBuffer();
}
