import type { Inconsistencia, OfertaCanonica, TotalesOferta } from "./tipos";
import { bloqueConContenido, sinTitular } from "./estructura";

/**
 * Los totales y los controles de una oferta. Sin modelo, sin red, sin secretos.
 *
 * Acá está la diferencia entre pedirle a alguien que revise y que el sistema
 * avise. El borrador se lee con un modelo —eso es inevitable, viene en Word
 * escrito por una persona— pero **ningún total sale del modelo**: las sumas las
 * hace este archivo, y de paso comprueba que lo impreso en el borrador coincida.
 *
 * Cuando no coincide, no se corrige: se reporta. Un borrador con el número de
 * oferta cambiado a medias, o con la sección de aportes heredada de otro
 * servicio por copiar y pegar, necesita que una persona decida cuál es el dato
 * correcto. Arreglarlo por cuenta propia es elegir por ella y, peor, esconder que
 * había algo mal.
 *
 * Sin "server-only" a propósito: es aritmética y se prueba con tsx
 * (scripts/probar-ofertas.mts).
 */

/** Tolerancia de un peso: los montos son enteros en CLP. */
const TOLERANCIA = 1;

export function calcularTotales(oferta: OfertaCanonica): TotalesOferta {
  // El cuadro de la sección 5 es el que manda; el de 2.3 es el respaldo, porque
  // hay ofertas cortas que traen solo ese.
  const cuadro = oferta.organizacion?.cuadroPersonal?.length
    ? oferta.organizacion.cuadroPersonal
    : (oferta.alcance?.personalEspecialista ?? []);

  const turnos = oferta.programa?.turnos ?? [];
  const lineas = oferta.precio?.lineas ?? [];

  return {
    dotacionTotal: cuadro.reduce((t, f) => t + (f.dotacion || 0), 0),
    horasPrograma: turnos.reduce((t, x) => t + (x.horas || 0), 0),
    cantidadTurnos: turnos.length,
    // Suma exacta y redondeo al final: sumar valores ya redondeados arrastra
    // hasta medio peso por línea, y esa basura es justo la que hace que un total
    // "no cuadre" por razones que no son del documento.
    totalNetoCalculado: Math.round(lineas.reduce((t, l) => t + l.cantidad * l.valorUnitario, 0)),
  };
}

/**
 * Los controles del borrador.
 *
 * Cada uno responde a un error que de verdad aparece en los borradores: números
 * de oferta que no coinciden entre el nombre del archivo, el título y la tabla;
 * secciones heredadas de otro servicio; sumas que no dan.
 */
export function detectarInconsistencias(
  oferta: OfertaCanonica,
  totales: TotalesOferta,
  nombreArchivo: string,
): Inconsistencia[] {
  const problemas: Inconsistencia[] = [];
  const aritmetica = (tipo: Inconsistencia["tipo"], detalle: string) =>
    problemas.push({ tipo, detalle, origen: "aritmetica" });

  // ── El número de oferta, en los tres lugares donde aparece ────────────────
  const enTabla = normalizarNumero(oferta.identificacion.numeroOferta);
  const enTitulo = numeroEnTexto(oferta.titulo);
  const enArchivo = numeroEnTexto(nombreArchivo);
  const enReferencia = numeroEnTexto(oferta.identificacion.referencia ?? "");

  for (const [donde, valor] of [
    ["el título", enTitulo],
    ["el nombre del archivo", enArchivo],
    ["la referencia", enReferencia],
  ] as const) {
    if (enTabla && valor && !mismoNumeroDeOferta(enTabla, valor)) {
      aritmetica(
        "numero_oferta",
        `La tabla de identificación dice ${enTabla} y ${donde} dice ${valor}. ` +
          "Suele ser un borrador copiado de otra oferta al que le cambiaron el número a medias.",
      );
    }
  }
  if (!enTabla) {
    aritmetica("falta_dato", "No se pudo leer el número de oferta en la tabla de identificación.");
  }

  // ── La tabla de precios ───────────────────────────────────────────────────
  const lineas = oferta.precio?.lineas ?? [];
  if (oferta.precio && lineas.length === 0) {
    aritmetica("falta_dato", "La sección de precio no tiene ninguna línea.");
  }

  lineas.forEach((linea, i) => {
    const calculado = Math.round(linea.cantidad * linea.valorUnitario);
    // `!= null` y no `!== null`: el modelo omite el campo cuando el documento no
    // imprime el total, así que acá llega ausente. Con la comparación estricta,
    // `undefined` pasaba el filtro y la resta daba NaN — un aviso inventado en
    // todas las líneas sin total impreso.
    if (linea.valorTotalImpreso != null && Math.abs(linea.valorTotalImpreso - calculado) > TOLERANCIA) {
      aritmetica(
        "linea_precio",
        `Línea ${i + 1} (${recortar(linea.cargo)}): el documento imprime ` +
          `${clp(linea.valorTotalImpreso)} pero ${linea.cantidad} × ${clp(linea.valorUnitario)} da ` +
          `${clp(calculado)}.`,
      );
    }
    if (linea.valorUnitario <= 0) {
      aritmetica(
        "linea_precio",
        `Línea ${i + 1} (${recortar(linea.cargo)}) quedó con valor unitario en 0: ` +
          "puede venir de una celda de fórmula sin recalcular en el borrador.",
      );
    }
  });

  const impreso = oferta.precio?.totalNetoImpreso ?? null;
  if (impreso != null && Math.abs(impreso - totales.totalNetoCalculado) > TOLERANCIA) {
    aritmetica(
      "suma_precios",
      `El TOTAL NETO impreso es ${clp(impreso)} y la suma de las líneas da ` +
        `${clp(totales.totalNetoCalculado)}: una diferencia de ` +
        `${clp(Math.abs(impreso - totales.totalNetoCalculado))}.`,
    );
  }
  if (lineas.length > 0 && impreso == null) {
    aritmetica(
      "falta_dato",
      "El borrador no trae un TOTAL NETO impreso, así que la suma de las líneas no se puede " +
        `verificar contra nada. El total calculado es ${clp(totales.totalNetoCalculado)}.`,
    );
  }

  // ── Dotación: los dos cuadros tienen que decir lo mismo ───────────────────
  const enAlcance = (oferta.alcance?.personalEspecialista ?? []).reduce((t, f) => t + (f.dotacion || 0), 0);
  const enOrganizacion = (oferta.organizacion?.cuadroPersonal ?? []).reduce(
    (t, f) => t + (f.dotacion || 0),
    0,
  );
  if (enAlcance > 0 && enOrganizacion > 0 && enAlcance !== enOrganizacion) {
    aritmetica(
      "dotacion",
      `El personal especialista de la sección 2.3 suma ${enAlcance} personas y el cuadro de ` +
        `la sección 5 suma ${enOrganizacion}. Son el mismo dato contado dos veces y no coinciden.`,
    );
  }
  if (totales.dotacionTotal === 0 && (oferta.organizacion || oferta.alcance)) {
    aritmetica("dotacion", "La dotación total quedó en 0: no se pudo leer ningún cuadro de personal.");
  }

  // ── Cada cargo con responsabilidad descrita debería estar en el cuadro ────
  const cargosDelCuadro = new Set(
    (oferta.organizacion?.cuadroPersonal ?? []).map((f) => normalizar(f.cargo)),
  );
  for (const r of oferta.organizacion?.responsabilidades ?? []) {
    // Una con el cargo vacío está marcada para sacar: no es una inconsistencia.
    if (r.cargo.trim() === "") continue;
    if (cargosDelCuadro.size > 0 && !cargosDelCuadro.has(normalizar(r.cargo))) {
      aritmetica(
        "contenido_ajeno",
        `"${r.cargo}" tiene responsabilidades descritas pero no aparece en el cuadro de personal. ` +
          "Es el rastro típico de una sección heredada de otra oferta.",
      );
    }
  }

  // ── Programa: las horas tienen que existir ────────────────────────────────
  if (oferta.programa && totales.horasPrograma === 0) {
    aritmetica("programa", "El programa no tiene horas: ningún turno trae su duración.");
  }

  // ── Aportes de la contraparte con el nombre de otro cliente ───────────────
  const cliente = oferta.identificacion.cliente;
  if (cliente && oferta.aportes) {
    const nombreCliente = primeraPalabraSignificativa(cliente);
    for (const linea of oferta.aportes.cliente) {
      const otro = otraEmpresaMencionada(linea, nombreCliente);
      if (otro) {
        aritmetica(
          "contenido_ajeno",
          `Un aporte del cliente menciona "${otro}" y el cliente de esta oferta es ${cliente}. ` +
            "Revisá si quedó de otra oferta.",
        );
      }
    }
  }

  // ── Un subtítulo agregado a mano y sin titular ────────────────────────────
  //
  // Uno vacío no se imprime, así que no hace falta avisar. El que sí importa es el
  // que tiene contenido escrito y quedó con el título con el que nació: ese SÍ sale
  // en el PDF, y sale diciendo "Nuevo subtítulo" en el documento que va al cliente.
  for (const bloque of oferta.bloques ?? []) {
    if (sinTitular(bloque) && bloqueConContenido(bloque)) {
      aritmetica(
        "falta_dato",
        `Hay contenido agregado a mano que quedó llamándose "${bloque.titulo.trim()}": ` +
          "va a salir así en el PDF.",
      );
    }
  }

  // ── Lo que el modelo no pudo leer entra como inconsistencia de lectura ────
  for (const dato of oferta.porConfirmar) {
    problemas.push({ tipo: "falta_dato", detalle: dato, origen: "lectura" });
  }

  return problemas;
}

/** Empresas conocidas que aparecen en los aportes de ofertas anteriores. */
const EMPRESAS_FRECUENTES = [
  "axinntus",
  "codelco",
  "amsa",
  "antofagasta minerals",
  "salfa",
  "fluor",
  "bhp",
  "anglo american",
  "collahuasi",
  "centinela",
  "franke",
  "kghm",
  "enami",
  "teck",
  "pucobre",
  "aes andes",
  "engie",
  "puerto mejillones",
];

/**
 * Busca el nombre de una empresa que NO es el cliente de esta oferta.
 *
 * Es una heurística sobre una lista de mandantes conocidos, no una detección
 * general: un aporte que diga "según los estándares de puerto Mejillones" en una
 * oferta para otro cliente es exactamente el copiar y pegar que hay que cazar,
 * pero nombrar a un tercero puede ser legítimo. Por eso se reporta y no se toca.
 */
function otraEmpresaMencionada(linea: string, nombreCliente: string): string | null {
  const texto = normalizar(linea);
  for (const empresa of EMPRESAS_FRECUENTES) {
    if (!texto.includes(empresa)) continue;
    if (nombreCliente && empresa.includes(nombreCliente)) continue;
    if (nombreCliente && normalizar(nombreCliente).includes(empresa)) continue;
    return empresa;
  }
  return null;
}

/** "OS 010 – 2026" → "OS 010-2026", para poder comparar. */
function normalizarNumero(valor: string | null | undefined): string | null {
  if (!valor) return null;
  return valor
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/\s*[-–—]\s*/g, "-");
}

/** Encuentra un número de oferta dentro de cualquier texto. */
function numeroEnTexto(texto: string): string | null {
  const m = texto.replace(/_/g, " ").match(/\bOS\s*\d{1,4}\s*[-–—]?\s*\d{4}\b/i);
  if (m) return normalizarNumero(m[0]);
  // "OS10" o "OS 10" sin año: se compara solo el número correlativo.
  const corto = texto.replace(/_/g, " ").match(/\bOS\s*0*(\d{1,4})\b/i);
  return corto ? `OS ${corto[1].padStart(3, "0")}` : null;
}

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** La primera palabra que identifica a una empresa, salteando artículos. */
function primeraPalabraSignificativa(nombre: string): string {
  const partes = normalizar(nombre).split(/\s+/);
  return partes.find((p) => p.length > 3) ?? partes[0] ?? "";
}

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");
const recortar = (t: string, largo = 42) => (t.length <= largo ? t : t.slice(0, largo - 1) + "…");

/**
 * ¿Dos textos hablan del mismo número de oferta?
 *
 * Tolera que uno traiga el año y el otro no —el nombre del archivo casi nunca lo
 * trae: "Propuesta Técnica_OS10.docx" contra "OS 010-2026"— porque si no, toda
 * oferta reportaría una inconsistencia falsa en cada carga, y una alerta que
 * suena siempre es una alerta que nadie lee.
 *
 * Se exporta para probarla por separado: es la comparación con más variantes en
 * los borradores reales.
 */
export function mismoNumeroDeOferta(a: string | null, b: string | null): boolean {
  const na = numeroEnTexto(a ?? "");
  const nb = numeroEnTexto(b ?? "");
  if (!na || !nb) return true; // sin dato no se puede afirmar que difieran
  if (na === nb) return true;
  const soloNumero = (v: string) => v.match(/(\d{1,4})/)?.[1]?.replace(/^0+/, "") ?? "";
  return soloNumero(na) === soloNumero(nb);
}
