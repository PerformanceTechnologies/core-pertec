// Carga masiva del Inventario: las columnas de la planilla y la validación de cada fila.
//
// Sin "server-only": lo usan el servidor (al leer el archivo), la pantalla (para mostrar
// las columnas) y las pruebas. Acá no se toca la base: se recibe cada fila como texto y
// los catálogos que ya existen, y se decide qué va a pasar con ella y qué está mal.

import type { EstadoOperativo, Seguimiento, TipoProducto } from "./inventario-modelo";

export interface ColumnaImportacion {
  clave: ClaveColumna;
  titulo: string;
  obligatoria?: boolean;
  ayuda: string;
  ejemplo: string;
  /** Otros nombres con que se reconoce el encabezado (sin tildes ni mayúsculas). */
  alias: string[];
}

export type ClaveColumna =
  | "sku" | "nombre" | "marca" | "categoria" | "unidad" | "tipo" | "seguimiento" | "estado" | "costo" | "precio"
  | "bodega" | "cantidad" | "lote" | "vencimiento" | "minimo" | "maximo" | "descripcion";

export const COLUMNAS_IMPORTACION: ColumnaImportacion[] = [
  { clave: "sku", titulo: "SKU / Código", ayuda: "Código interno. Si existe, se actualiza ese producto; si no, se busca por nombre.", ejemplo: "VUL-001", alias: ["sku", "codigo", "código", "cod", "referencia interna", "codigo interno"] },
  { clave: "nombre", titulo: "Nombre", obligatoria: true, ayuda: "Nombre del producto. La lista trae cómo están escritos en el histórico de compras, como referencia; si es nuevo, se escribe igual.", ejemplo: "Parche radial 120x180", alias: ["nombre", "producto", "nombre producto", "descripcion corta"] },
  { clave: "marca", titulo: "Marca", ayuda: "Texto libre. La lista trae las marcas del histórico de compras para usar el mismo formato; si es nueva, se escribe igual.", ejemplo: "3M", alias: ["marca", "fabricante", "brand"] },
  { clave: "categoria", titulo: "Categoría", obligatoria: true, ayuda: "Si no existe, se crea (o queda con error, según la opción).", ejemplo: "Insumos de vulcanización", alias: ["categoria", "familia", "grupo"] },
  { clave: "unidad", titulo: "Unidad", ayuda: "Nombre o abreviación (un, kg, lt…). Si no existe, se crea.", ejemplo: "un", alias: ["unidad", "unidad de medida", "um", "u/m", "uom"] },
  { clave: "tipo", titulo: "Tipo", ayuda: "Almacenable, Consumible o Servicio. Vacío = Almacenable.", ejemplo: "Almacenable", alias: ["tipo", "tipo producto"] },
  { clave: "seguimiento", titulo: "Seguimiento", ayuda: "Ninguno, Lote o Serie. Vacío = Ninguno.", ejemplo: "Lote", alias: ["seguimiento", "trazabilidad", "control"] },
  { clave: "estado", titulo: "Estado", ayuda: "Operativo o No operativo. Vacío = Operativo (o lo que ya tenía el producto).", ejemplo: "Operativo", alias: ["estado", "estado operativo", "operativo", "condicion", "condición"] },
  { clave: "costo", titulo: "Costo unitario", ayuda: "En pesos, sin puntos de miles ni signo $.", ejemplo: "12500", alias: ["costo", "costo unitario", "precio costo", "valor unitario", "costo unit"] },
  { clave: "precio", titulo: "Precio venta", ayuda: "En pesos.", ejemplo: "18900", alias: ["precio", "precio venta", "precio de venta", "pvp"] },
  { clave: "bodega", titulo: "Bodega / Ubicación", obligatoria: true, ayuda: "Nombre o código de una bodega o ubicación interna que ya exista (AMU, CAL, ENE…).", ejemplo: "AMU", alias: ["bodega", "ubicacion", "ubicación", "almacen", "almacén", "bodega ubicacion"] },
  { clave: "cantidad", titulo: "Cantidad", obligatoria: true, ayuda: "Stock que HAY HOY en esa bodega (conteo; puede ser 0). El sistema ajusta la diferencia; no se suma a lo que ya había.", ejemplo: "40", alias: ["cantidad", "stock", "existencia", "cantidad a mano", "conteo", "saldo"] },
  { clave: "lote", titulo: "Lote / Serie", ayuda: "Obligatorio con cantidad si el producto se sigue por lote o serie. Si no existe, se crea.", ejemplo: "L-2026-11", alias: ["lote", "serie", "numero de serie", "n serie", "lote serie"] },
  { clave: "vencimiento", titulo: "Vencimiento", ayuda: "Fecha de vencimiento del lote: AAAA-MM-DD o DD-MM-AAAA.", ejemplo: "2027-06-30", alias: ["vencimiento", "fecha vencimiento", "vence", "caducidad"] },
  { clave: "minimo", titulo: "Stock mínimo", ayuda: "Regla de reabastecimiento en esa bodega.", ejemplo: "10", alias: ["minimo", "mínimo", "stock minimo", "min"] },
  { clave: "maximo", titulo: "Stock máximo", ayuda: "Hasta cuánto reponer.", ejemplo: "60", alias: ["maximo", "máximo", "stock maximo", "max"] },
  { clave: "descripcion", titulo: "Descripción", ayuda: "Texto libre.", ejemplo: "Para neumáticos OTR", alias: ["descripcion", "descripción", "detalle", "observacion", "notas"] },
];

export const MAX_FILAS_IMPORTACION = 1000;

/** "Categoría " → "categoria": para comparar encabezados y nombres sin tildes, mayúsculas ni espacios de más. */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9/]+/g, " ").trim();
}

/** A qué columna corresponde cada encabezado del archivo (índice → clave). Los desconocidos se ignoran. */
export function mapearEncabezados(encabezados: string[]): { mapa: Map<number, ClaveColumna>; faltan: string[] } {
  const mapa = new Map<number, ClaveColumna>();
  const usadas = new Set<ClaveColumna>();
  encabezados.forEach((h, i) => {
    const n = normalizar(h.replace(/\*/g, ""));
    if (!n) return;
    const col = COLUMNAS_IMPORTACION.find((c) => !usadas.has(c.clave) && (normalizar(c.titulo) === n || c.alias.some((a) => normalizar(a) === n)));
    if (col) {
      mapa.set(i, col.clave);
      usadas.add(col.clave);
    }
  });
  const faltan = COLUMNAS_IMPORTACION.filter((c) => c.obligatoria && !usadas.has(c.clave)).map((c) => c.titulo);
  return { mapa, faltan };
}

/** "12.500", "$12.500", "12500,5", "1,234.5" → número. null si está vacío; NaN si no se entiende. */
export function leerNumero(texto: string): number | null {
  const t = texto.replace(/[$\s]/g, "");
  if (!t) return null;
  let limpio = t;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) limpio = t.replace(/\./g, "").replace(",", "."); // 12.500,5
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) limpio = t.replace(/,/g, ""); // 12,500.5
  else limpio = t.replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : NaN;
}

/** "2027-06-30", "30-06-2027", "30/06/2027" → "2027-06-30". null si está vacío; "" si no se entiende. */
export function leerFecha(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(t);
  let a: number, mes: number, d: number;
  if (m) [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(t);
    if (!m) return "";
    [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  const f = new Date(Date.UTC(a, mes - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return "";
  return f.toISOString().slice(0, 10);
}

const TIPOS: Record<string, TipoProducto> = { almacenable: "almacenable", consumible: "consumible", servicio: "servicio" };
const SEGUIMIENTOS: Record<string, Seguimiento> = {
  ninguno: "ninguno", "sin seguimiento": "ninguno", no: "ninguno", lote: "lote", lotes: "lote", "por lote": "lote",
  serie: "serie", series: "serie", "numero de serie": "serie", "por numero de serie": "serie",
};

const ESTADOS: Record<string, EstadoOperativo> = {
  operativo: "operativo", "en uso": "operativo", bueno: "operativo", ok: "operativo", si: "operativo",
  "no operativo": "no_operativo", "fuera de servicio": "no_operativo", "en reparacion": "no_operativo", malo: "no_operativo", danado: "no_operativo", no: "no_operativo",
};

/** Lo que ya existe en la base, con claves normalizadas, para resolver cada fila. */
export interface CatalogosImportacion {
  /** sku normalizado → id producto */
  productosPorSku: Map<string, { id: string; seguimiento: Seguimiento }>;
  /** nombre normalizado → id producto */
  productosPorNombre: Map<string, { id: string; seguimiento: Seguimiento }>;
  /**
   * SKUs y nombres normalizados de los productos ARCHIVADOS. Una fila que coincide con uno no se
   * puede cargar: no es «nuevo» (el SKU es único y chocaría) ni es «actualizar» (no está en el catálogo).
   */
  archivados?: { porSku: Set<string>; porNombre: Set<string> };
  /** nombre o código normalizado → id de ubicación INTERNA donde queda el stock */
  bodegas: Map<string, string>;
  /** Nombres normalizados de las categorías que ya existen. */
  categorias?: Set<string>;
  /** Nombres y abreviaciones normalizados de las unidades que ya existen. */
  unidades?: Set<string>;
}

/** Las opciones de la importación, como en Odoo. */
export interface OpcionesImportacion {
  /** true: una categoría o unidad que no existe se crea. false: la fila queda con error. */
  crearFaltantes: boolean;
}

/**
 * Un mapeo columna del archivo → campo del Core (null = no importar), como la pantalla de
 * Odoo. Revisa que no haya un campo elegido dos veces y que esté el obligatorio.
 */
export function revisarMapeo(mapeo: (ClaveColumna | null)[]): string[] {
  const errores: string[] = [];
  const vistas = new Map<ClaveColumna, number>();
  for (const c of mapeo) if (c) vistas.set(c, (vistas.get(c) ?? 0) + 1);
  for (const [c, n] of vistas) {
    if (n > 1) errores.push(`«${COLUMNAS_IMPORTACION.find((x) => x.clave === c)!.titulo}» está elegido en ${n} columnas.`);
  }
  for (const c of COLUMNAS_IMPORTACION) {
    if (c.obligatoria && !vistas.has(c.clave)) errores.push(`Falta elegir qué columna es «${c.titulo}».`);
  }
  return errores;
}

/** El mapeo sugerido para unos encabezados (lo que Odoo propone solo al subir el archivo). */
export function sugerirMapeo(encabezados: string[]): (ClaveColumna | null)[] {
  const { mapa } = mapearEncabezados(encabezados);
  return encabezados.map((_, i) => mapa.get(i) ?? null);
}

export interface FilaImportacion {
  /** Número de fila en la planilla (la 1 es el encabezado). */
  numero: number;
  accion: "crear" | "actualizar";
  productoId: string | null;
  nombre: string;
  sku: string | null;
  marca: string | null;
  categoria: string | null;
  unidad: string | null;
  tipo: TipoProducto | null;
  seguimiento: Seguimiento | null;
  /** null: la celda vino vacía (al crear queda «operativo»; al actualizar no se toca). */
  estadoOperativo: EstadoOperativo | null;
  costo: number | null;
  precio: number | null;
  descripcion: string | null;
  bodega: string | null;
  ubicacionId: string | null;
  cantidad: number | null;
  lote: string | null;
  vencimiento: string | null;
  minimo: number | null;
  maximo: number | null;
  /** Lo que esta fila va a crear además del producto («categoría», «unidad»). */
  nuevas: string[];
  errores: string[];
}

/**
 * Valida una fila y decide si crea o actualiza. Una fila con errores no se importa; las
 * demás sí (la carga no es todo o nada: se informa cuáles quedaron fuera y por qué).
 */
export function validarFila(
  numero: number,
  celdas: Partial<Record<ClaveColumna, string>>,
  cat: CatalogosImportacion,
  opciones: OpcionesImportacion = { crearFaltantes: true },
): FilaImportacion {
  const v = (c: ClaveColumna) => (celdas[c] ?? "").toString().trim();
  const errores: string[] = [];
  const nuevas: string[] = [];
  // Categoría y unidad: se buscan por nombre (y la unidad también por abreviación).
  for (const [campo, catalogo, etiqueta] of [
    ["categoria", cat.categorias, "categoría"],
    ["unidad", cat.unidades, "unidad"],
  ] as const) {
    const valor = v(campo);
    if (!valor || !catalogo || catalogo.has(normalizar(valor))) continue;
    if (opciones.crearFaltantes) nuevas.push(`${etiqueta} «${valor}»`);
    else errores.push(`No existe la ${etiqueta} «${valor}».`);
  }

  const nombre = v("nombre").slice(0, 200);
  const sku = v("sku").slice(0, 80) || null;
  if (!nombre) errores.push("Falta el nombre.");
  // Bodega, categoría y cantidad son obligatorias, salvo en un servicio (no lleva stock).
  const esServicio = normalizar(v("tipo")) === "servicio";
  if (!v("categoria")) errores.push("Falta la categoría.");
  if (!esServicio && !v("bodega")) errores.push("Falta la bodega.");
  if (!esServicio && !v("cantidad")) errores.push("Falta la cantidad (puede ser 0).");

  const existente = (sku && cat.productosPorSku.get(normalizar(sku))) || (nombre ? cat.productosPorNombre.get(normalizar(nombre)) : undefined) || null;

  if (!existente && ((sku && cat.archivados?.porSku.has(normalizar(sku))) || (nombre && cat.archivados?.porNombre.has(normalizar(nombre))))) {
    errores.push(`«${nombre || sku}» es un producto archivado: restáuralo desde Productos › Archivados antes de cargarlo.`);
  }

  let tipo: TipoProducto | null = null;
  if (v("tipo")) {
    tipo = TIPOS[normalizar(v("tipo"))] ?? null;
    if (!tipo) errores.push(`Tipo «${v("tipo")}» no válido (Almacenable, Consumible o Servicio).`);
  }
  let seguimiento: Seguimiento | null = null;
  if (v("seguimiento")) {
    seguimiento = SEGUIMIENTOS[normalizar(v("seguimiento"))] ?? null;
    if (!seguimiento) errores.push(`Seguimiento «${v("seguimiento")}» no válido (Ninguno, Lote o Serie).`);
  }

  let estadoOperativo: EstadoOperativo | null = null;
  if (v("estado")) {
    estadoOperativo = ESTADOS[normalizar(v("estado"))] ?? null;
    if (!estadoOperativo) errores.push(`Estado «${v("estado")}» no válido (Operativo o No operativo).`);
  }

  const numeroDe = (c: ClaveColumna, etiqueta: string): number | null => {
    const n = leerNumero(v(c));
    if (n === null) return null;
    if (Number.isNaN(n)) {
      errores.push(`${etiqueta} «${v(c)}» no es un número.`);
      return null;
    }
    if (n < 0) {
      errores.push(`${etiqueta} no puede ser negativo.`);
      return null;
    }
    return n;
  };
  const costo = numeroDe("costo", "Costo");
  const precio = numeroDe("precio", "Precio");
  const cantidad = numeroDe("cantidad", "Cantidad");
  const minimo = numeroDe("minimo", "Mínimo");
  const maximo = numeroDe("maximo", "Máximo");
  if (minimo !== null && maximo !== null && maximo < minimo) errores.push("El máximo no puede ser menor que el mínimo.");

  const bodega = v("bodega") || null;
  let ubicacionId: string | null = null;
  if (bodega) {
    ubicacionId = cat.bodegas.get(normalizar(bodega)) ?? null;
    if (!ubicacionId) errores.push(`No existe la bodega o ubicación interna «${bodega}». Créala primero en Ubicaciones.`);
  }

  const tipoFinal = tipo ?? (existente ? null : "almacenable");
  if (tipoFinal === "servicio" && cantidad !== null && cantidad > 0) errores.push("Un servicio no lleva stock.");

  const segFinal = seguimiento ?? existente?.seguimiento ?? "ninguno";
  const lote = v("lote").slice(0, 120) || null;
  if (cantidad !== null && cantidad > 0 && segFinal !== "ninguno" && !lote) {
    errores.push(`El producto se sigue por ${segFinal === "lote" ? "lote" : "número de serie"}: falta el lote/serie.`);
  }
  if (segFinal === "serie" && cantidad !== null && cantidad > 1) errores.push("Con seguimiento por serie, cada fila es 1 unidad (una serie por fila).");

  const vencimiento = leerFecha(v("vencimiento"));
  if (vencimiento === "") errores.push(`Fecha de vencimiento «${v("vencimiento")}» no válida.`);

  return {
    numero,
    accion: existente ? "actualizar" : "crear",
    productoId: existente?.id ?? null,
    nombre,
    sku,
    marca: v("marca").replace(/\s+/g, " ").slice(0, 80) || null,
    categoria: v("categoria").slice(0, 120) || null,
    unidad: v("unidad").slice(0, 40) || null,
    tipo,
    seguimiento,
    estadoOperativo,
    costo,
    precio,
    descripcion: v("descripcion").slice(0, 2000) || null,
    bodega,
    ubicacionId,
    cantidad,
    lote,
    vencimiento: vencimiento || null,
    minimo,
    maximo,
    nuevas,
    errores,
  };
}

/**
 * Dos filas del mismo producto que crearían dos productos distintos (mismo SKU o nombre,
 * aún no existentes) se marcan: la segunda pasa a "actualizar" la primera. Y la misma
 * combinación producto + bodega + lote dos veces es un error (¿cuál cantidad vale?).
 */
export function revisarDuplicados(filas: FilaImportacion[]): FilaImportacion[] {
  const vistos = new Map<string, number>();
  const stock = new Set<string>();
  return filas.map((f) => {
    if (f.errores.length) return f;
    const clave = f.productoId ?? (f.sku ? `sku:${normalizar(f.sku)}` : `nom:${normalizar(f.nombre)}`);
    const errores = [...f.errores];
    let accion = f.accion;
    if (!f.productoId) {
      if (vistos.has(clave)) accion = "actualizar";
      else vistos.set(clave, f.numero);
    }
    if (f.cantidad !== null && f.ubicacionId) {
      const k = `${clave}|${f.ubicacionId}|${normalizar(f.lote ?? "")}`;
      if (stock.has(k)) errores.push("Este producto ya tiene cantidad en esta bodega (y lote) en otra fila.");
      stock.add(k);
    }
    return { ...f, accion, errores };
  });
}
