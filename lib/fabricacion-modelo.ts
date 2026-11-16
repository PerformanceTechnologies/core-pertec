// Sin "server-only": lo usan el servidor (para armar la ficha y validar) y los componentes cliente
// (para recalcular en vivo mientras se escribe un ítem). Todo aquí es aritmética pura.
//
// FABRICACIÓN — la hoja de costos de un producto que fabricamos.
//
// Un producto fabricado se describe con una «receta de costos»: una lista de ítems agrupados por
// naturaleza (materiales, mano de obra, maquinaria, servicios externos, otros). Cada ítem lleva
// cantidad, costo unitario y, si corresponde, un % de merma. La receta rinde cierta cantidad de
// unidades terminadas (el «rendimiento»): el costo de UNA unidad es el costo del lote dividido por él.
//
//   subtotal del ítem  = cantidad × costo unitario × (1 + merma / 100)
//   costo directo      = suma de los subtotales
//   gastos indirectos  = costo directo × (% indirectos / 100)
//   costo del lote     = costo directo + gastos indirectos
//   costo unitario     = costo del lote ÷ rendimiento
//   precio sugerido    = costo unitario ÷ (1 − margen / 100)      ← margen sobre el PRECIO, no sobre el costo
//
// El margen se calcula sobre el precio de venta (lo que se lee en un estado de resultados), no como
// recargo sobre el costo: un 30 % de margen es un precio de costo ÷ 0,70, no costo × 1,30.

/** Naturaleza de un ítem de costo. El orden es el orden en que se muestran las secciones. */
export const GRUPOS_COSTO = ["material", "mano_obra", "maquinaria", "servicio", "otro"] as const;
export type GrupoCosto = (typeof GRUPOS_COSTO)[number];

export const ETIQUETA_GRUPO: Record<GrupoCosto, string> = {
  material: "Materiales",
  mano_obra: "Mano de obra",
  maquinaria: "Maquinaria y equipos",
  servicio: "Servicios externos",
  otro: "Otros costos",
};

/** Cómo se llama un solo ítem de cada grupo (para el botón «Agregar …» y los títulos). */
export const ETIQUETA_GRUPO_SINGULAR: Record<GrupoCosto, string> = {
  material: "material",
  mano_obra: "mano de obra",
  maquinaria: "maquinaria",
  servicio: "servicio externo",
  otro: "otro costo",
};

/** Qué se escribe en cada grupo, en una línea. Sirve de guía al agregar el primer ítem. */
export const AYUDA_GRUPO: Record<GrupoCosto, string> = {
  material: "Insumos y materias primas que se consumen al fabricar.",
  mano_obra: "Horas de las personas que intervienen en el proceso.",
  maquinaria: "Uso de máquinas, herramientas o energía por hora.",
  servicio: "Trabajos que hace un tercero: corte, pintura, galvanizado…",
  otro: "Embalaje, fletes, certificaciones y cualquier costo que no calce arriba.",
};

/** La unidad que se propone al elegir un grupo (se puede cambiar). */
export const UNIDAD_SUGERIDA: Record<GrupoCosto, string> = {
  material: "un",
  mano_obra: "hr",
  maquinaria: "hr",
  servicio: "un",
  otro: "un",
};

export type EstadoFabricacion = "borrador" | "activo" | "archivado";
export const ESTADOS_FABRICACION: EstadoFabricacion[] = ["borrador", "activo", "archivado"];
export const ETIQUETA_ESTADO_FABRICACION: Record<EstadoFabricacion, string> = {
  borrador: "Borrador",
  activo: "Activo",
  archivado: "Archivado",
};

export function esGrupoCosto(v: unknown): v is GrupoCosto {
  return typeof v === "string" && (GRUPOS_COSTO as readonly string[]).includes(v);
}

export function esEstadoFabricacion(v: unknown): v is EstadoFabricacion {
  return typeof v === "string" && (ESTADOS_FABRICACION as string[]).includes(v);
}

// ---------- Tipos de dominio -------------------------------------------------

export type ItemCosto = {
  id: string;
  fabricacionId: string;
  grupo: GrupoCosto;
  descripcion: string;
  /** El producto de Inventario del que sale este material (opcional). Permite refrescar su costo. */
  productoId: string | null;
  unidad: string;
  cantidad: number;
  costoUnitario: number;
  mermaPct: number;
  orden: number;
  nota: string | null;
};

export type ProductoFabricado = {
  id: string;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  unidadId: string | null;
  /** El producto terminado en el catálogo de Inventario, si ya existe (opcional). */
  productoId: string | null;
  /** Cuántas unidades terminadas rinde la receta completa. */
  rendimiento: number;
  indirectosPct: number;
  margenPct: number;
  /** Precio de venta vigente, si ya se definió. 0 = sin definir. */
  precioVenta: number;
  estado: EstadoFabricacion;
  notas: string | null;
  creadoPor: string | null;
  creadoEn: string;
  actualizadoEn: string;
};

export type ItemEntrada = Pick<ItemCosto, "cantidad" | "costoUnitario" | "mermaPct">;

// ---------- Cálculo ------------------------------------------------------------

/** Redondea a 2 decimales: lo que se muestra en pantalla y se compara entre cifras. */
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Un número finito y no negativo; cualquier otra cosa cuenta como 0. */
function noNegativo(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Subtotal de un ítem: cantidad × costo unitario, más la merma. */
export function subtotalItem(i: ItemEntrada): number {
  const merma = Math.min(noNegativo(i.mermaPct), 100);
  return noNegativo(i.cantidad) * noNegativo(i.costoUnitario) * (1 + merma / 100);
}

export type ResumenCosto = {
  /** Suma de los subtotales de cada grupo. */
  porGrupo: Record<GrupoCosto, number>;
  /** Cuántos ítems hay en cada grupo. */
  itemsPorGrupo: Record<GrupoCosto, number>;
  costoDirecto: number;
  indirectos: number;
  costoLote: number;
  costoUnitario: number;
  /** Precio que deja el margen objetivo sobre el precio (null si el margen no tiene solución). */
  precioSugerido: number | null;
  /** Utilidad por unidad al precio de venta vigente (null si no hay precio definido). */
  utilidadUnitaria: number | null;
  /** Margen real sobre el precio de venta vigente, en % (null si no hay precio definido). */
  margenReal: number | null;
  /** Recargo sobre el costo, en % (null si no hay precio definido o el costo es 0). */
  recargoReal: number | null;
};

const CEROS = (): Record<GrupoCosto, number> => ({ material: 0, mano_obra: 0, maquinaria: 0, servicio: 0, otro: 0 });

/**
 * El costo completo de un producto fabricado.
 *
 * No lanza con datos raros: un rendimiento 0 o negativo se trata como 1 (la receta rinde una unidad),
 * y un margen de 100 % o más no tiene precio sugerido (dividiría por cero o daría negativo).
 */
export function calcularCosto(
  items: (ItemEntrada & { grupo: GrupoCosto })[],
  params: { rendimiento: number; indirectosPct: number; margenPct: number; precioVenta: number },
): ResumenCosto {
  const porGrupo = CEROS();
  const itemsPorGrupo = CEROS();
  for (const i of items) {
    porGrupo[i.grupo] += subtotalItem(i);
    itemsPorGrupo[i.grupo] += 1;
  }
  const costoDirecto = GRUPOS_COSTO.reduce((t, g) => t + porGrupo[g], 0);
  const indirectos = costoDirecto * (noNegativo(params.indirectosPct) / 100);
  const costoLote = costoDirecto + indirectos;
  const rendimiento = noNegativo(params.rendimiento) || 1;
  const costoUnitario = costoLote / rendimiento;

  const margen = noNegativo(params.margenPct);
  const precioSugerido = margen < 100 ? costoUnitario / (1 - margen / 100) : null;

  const precio = noNegativo(params.precioVenta);
  const hayPrecio = precio > 0;
  return {
    porGrupo,
    itemsPorGrupo,
    costoDirecto,
    indirectos,
    costoLote,
    costoUnitario,
    precioSugerido,
    utilidadUnitaria: hayPrecio ? precio - costoUnitario : null,
    margenReal: hayPrecio ? ((precio - costoUnitario) / precio) * 100 : null,
    recargoReal: hayPrecio && costoUnitario > 0 ? ((precio - costoUnitario) / costoUnitario) * 100 : null,
  };
}

/** Qué parte del costo directo es cada grupo, en %, para la barra de composición. Los grupos en 0 salen. */
export function composicion(porGrupo: Record<GrupoCosto, number>): { grupo: GrupoCosto; monto: number; pct: number }[] {
  const total = GRUPOS_COSTO.reduce((t, g) => t + porGrupo[g], 0);
  if (total <= 0) return [];
  return GRUPOS_COSTO.filter((g) => porGrupo[g] > 0).map((g) => ({ grupo: g, monto: porGrupo[g], pct: (porGrupo[g] / total) * 100 }));
}

/** Lo que se sugiere al ver el margen real frente al objetivo: bajo, en meta o sobre. */
export function lecturaMargen(margenReal: number | null, objetivo: number): "sin_precio" | "bajo" | "en_meta" {
  if (margenReal === null) return "sin_precio";
  return margenReal + 1e-9 < objetivo ? "bajo" : "en_meta";
}

/** Formatea un porcentaje: 12 → "12 %", 12,5 → "12,5 %". */
export function formatearPct(n: number): string {
  return `${(Math.round((n + Number.EPSILON) * 10) / 10).toLocaleString("es-CL", { maximumFractionDigits: 1 })} %`;
}

/** Formatea un monto con hasta 2 decimales (el costo unitario de un material puede ser $12,50). */
export function formatearMontoFino(n: number): string {
  return n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: n !== 0 && Math.abs(n) < 100 ? 2 : 0 });
}

/**
 * Lee un número de un campo de formulario. Los <input type="number"> mandan «12.5» (punto); si alguien
 * escribió «1.250,5» a la chilena, la coma manda y los puntos son miles. NaN si no es un número.
 */
export function leerNumero(v: FormDataEntryValue | null | undefined): number {
  const crudo = String(v ?? "").trim();
  const t = crudo.includes(",") ? crudo.replace(/\./g, "").replace(",", ".") : crudo;
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Los textos del documento, con espacios normalizados y un tope de largo. */
export function limpiarTexto(v: FormDataEntryValue | null | undefined, max: number): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
