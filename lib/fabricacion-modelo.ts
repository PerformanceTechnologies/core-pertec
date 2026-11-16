// Sin "server-only": lo usan el servidor (para armar la ficha y validar) y los componentes cliente
// (para recalcular en vivo mientras se escribe un ítem). Todo aquí es aritmética pura.
//
// FABRICACIÓN — cuánto cuesta fabricar un producto.
//
// Un producto fabricado se describe con una lista de ítems de costo agrupados por naturaleza
// (materiales, mano de obra, maquinaria, servicios externos, otros). Cada ítem lleva cantidad, costo
// unitario y, si corresponde, un % de merma. Eso es todo el cálculo:
//
//   subtotal del ítem        = cantidad × costo unitario × (1 + merma / 100)
//   costo de fabricación     = suma de los subtotales        ← lo que se le puede mostrar a un proveedor
//   precio con margen        = costo ÷ (1 − margen / 100)    ← INTERNO: lo que cobramos si fabricamos nosotros
//
// El margen es un solo %, sobre el PRECIO (no un recargo sobre el costo): con 30 %, el precio es
// costo ÷ 0,70, no costo × 1,30. El margen no sale jamás en el PDF.

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
  /** El margen que cobramos cuando fabricamos, en % del precio. Interno: no sale en el PDF. */
  margenPct: number;
  estado: EstadoFabricacion;
  /** Notas internas: tampoco salen en el PDF. */
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
  /** El costo de fabricar UNA unidad: la suma de todos los ítems. */
  costo: number;
  /** El precio que deja el margen (null si el margen no tiene solución: 100 % o más). */
  precioConMargen: number | null;
  /** Lo que queda sobre el costo al precio con margen. */
  utilidad: number | null;
};

const CEROS = (): Record<GrupoCosto, number> => ({ material: 0, mano_obra: 0, maquinaria: 0, servicio: 0, otro: 0 });

/**
 * El costo de un producto fabricado. No lanza con datos raros: un margen de 100 % o más no tiene
 * precio (dividiría por cero o daría negativo) y un ítem con números inválidos cuenta como 0.
 */
export function calcularCosto(items: (ItemEntrada & { grupo: GrupoCosto })[], params: { margenPct: number }): ResumenCosto {
  const porGrupo = CEROS();
  const itemsPorGrupo = CEROS();
  for (const i of items) {
    porGrupo[i.grupo] += subtotalItem(i);
    itemsPorGrupo[i.grupo] += 1;
  }
  const costo = GRUPOS_COSTO.reduce((t, g) => t + porGrupo[g], 0);
  const margen = noNegativo(params.margenPct);
  const precioConMargen = margen < 100 ? costo / (1 - margen / 100) : null;
  return { porGrupo, itemsPorGrupo, costo, precioConMargen, utilidad: precioConMargen === null ? null : precioConMargen - costo };
}

/** Qué parte del costo es cada grupo, en %, para la barra de composición. Los grupos en 0 salen. */
export function composicion(porGrupo: Record<GrupoCosto, number>): { grupo: GrupoCosto; monto: number; pct: number }[] {
  const total = GRUPOS_COSTO.reduce((t, g) => t + porGrupo[g], 0);
  if (total <= 0) return [];
  return GRUPOS_COSTO.filter((g) => porGrupo[g] > 0).map((g) => ({ grupo: g, monto: porGrupo[g], pct: (porGrupo[g] / total) * 100 }));
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
