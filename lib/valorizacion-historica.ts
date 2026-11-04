import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import type { RegistroLeido } from "./valorizacion-historica-excel";
import {
  CONTROL_VACIO,
  armarCatalogo,
  claveDocumento,
  documentosConAlcance,
  REFERENCIAS_VACIAS,
  referenciasDe,
  proveedoresConCifras,
  resumirRegistro,
  textoDeLinea,
  type ControlRegistro,
  type DatosHistoricos,
  type DocumentoConAlcance,
  type Importacion,
  type ItemCatalogo,
  type LineaCompra,
  type ProveedorConCifras,
  type ReferenciasHistoricas,
  type ResumenGeneral,
} from "./valorizacion-historica-modelo";

// -----------------------------------------------------------------------------
//  Capa de datos de la Valorización histórica (solo servidor). Lee y escribe las tablas vh_*.
//
//  Son unas 4 mil líneas que NO cambian (solo cuando se sube otra versión del Excel), así que se
//  leen una vez y quedan en memoria del servidor, junto con lo que se calcula de ellas (catálogo,
//  resumen, cifras por proveedor). Cada pedido hace una sola consulta chica —cuál carga está
//  activa— y si es la misma que está en memoria no vuelve a leer nada.
// -----------------------------------------------------------------------------

const T = {
  importaciones: "vh_importaciones",
  lineas: "vh_lineas",
  documentos: "vh_documentos",
  proveedores: "vh_proveedores",
  categorias: "vh_categorias",
} as const;

function revienta(que: string, error: { message: string } | null): void {
  if (error) throw new Error(`[valorizacion-historica] No se pudo ${que}: ${error.message}`);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any): number => (v === null || v === undefined ? 0 : Number(v));
const numONull = (v: any): number | null => (v === null || v === undefined ? null : Number(v));

function aImportacion(r: any): Importacion {
  return {
    id: r.id,
    archivo: r.archivo,
    creadoPor: r.creado_por,
    creadoEn: r.creado_en,
    desde: r.desde,
    hasta: r.hasta,
    lineas: r.lineas,
    documentos: r.documentos,
    proveedores: r.proveedores,
    montoTotal: num(r.monto_total),
  };
}

function aLinea(r: any): LineaCompra {
  return {
    n: r.n,
    fecha: r.fecha,
    tipoDocumento: r.tipo_documento,
    folio: num(r.folio),
    rut: r.rut,
    proveedor: r.proveedor,
    codigoProveedor: r.codigo_proveedor,
    glosa: r.glosa,
    producto: r.producto,
    marca: r.marca,
    modelo: r.modelo,
    talla: r.talla,
    categoria: r.categoria,
    subcategoria: r.subcategoria,
    tipoItem: r.tipo_item,
    cantidad: numONull(r.cantidad),
    unidad: r.unidad,
    precioUnitario: numONull(r.precio_unitario),
    descuentoLinea: numONull(r.descuento_linea),
    valorLinea: num(r.valor_linea),
    factorDescuentoGlobal: num(r.factor_descuento_global),
    valorAjustado: num(r.valor_ajustado),
    costoUnitario: numONull(r.costo_unitario),
    estadoCuadratura: r.estado_cuadratura,
    revisar: r.revisar,
    pdf: r.pdf,
    referencias: r.referencias,
    clave: r.clave,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Trae una tabla completa de una carga, de a 1.000 filas (el tope de PostgREST). */
async function todas<T>(tabla: string, importacionId: string, orden: string): Promise<T[]> {
  const PAGINA = 1000;
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from(tabla)
      .select("*")
      .eq("importacion_id", importacionId)
      .order(orden)
      .range(desde, desde + PAGINA - 1);
    revienta(`leer ${tabla}`, error);
    filas.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) return filas;
  }
}

export async function importacionActiva(): Promise<Importacion | null> {
  const { data, error } = await supabaseAdmin.from(T.importaciones).select("*").eq("estado", "activa").maybeSingle();
  revienta("leer la carga activa", error);
  return data ? aImportacion(data) : null;
}

/** Las cargas guardadas (la activa y la anterior), de la más nueva a la más vieja. */
export async function listarImportaciones(): Promise<(Importacion & { estado: string })[]> {
  const { data, error } = await supabaseAdmin.from(T.importaciones).select("*").in("estado", ["activa", "reemplazada"]).order("creado_en", { ascending: false });
  revienta("listar las cargas", error);
  return (data ?? []).map((r) => ({ ...aImportacion(r), estado: r.estado as string }));
}

async function leerDatos(imp: Importacion, control: ControlRegistro): Promise<DatosHistoricos> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [lineas, documentos, proveedores, categorias] = await Promise.all([
    todas<any>(T.lineas, imp.id, "n"),
    todas<any>(T.documentos, imp.id, "n"),
    todas<any>(T.proveedores, imp.id, "rut"),
    todas<any>(T.categorias, imp.id, "orden"),
  ]);
  return {
    importacion: imp,
    control,
    lineas: lineas.map(aLinea),
    documentos: documentos.map((r) => ({
      n: r.n,
      fecha: r.fecha,
      tipo: r.tipo,
      folio: num(r.folio),
      rut: r.rut,
      proveedor: r.proveedor,
      direccion: r.direccion,
      comuna: r.comuna,
      contactoPertec: r.contacto_pertec,
      montoNeto: num(r.monto_neto),
      montoExento: num(r.monto_exento),
      iva: num(r.iva),
      impuestoAdicional: num(r.impuesto_adicional),
      total: num(r.total),
      estadoCuadratura: r.estado_cuadratura,
      referencias: r.referencias,
      pdf: r.pdf,
    })),
    proveedores: proveedores.map((r) => ({
      rut: r.rut,
      razonSocial: r.razon_social,
      giro: r.giro,
      direccion: r.direccion,
      comuna: r.comuna,
      email: r.email,
      contactoPertec: r.contacto_pertec,
      categoriaPrincipal: r.categoria_principal,
    })),
    categorias: categorias.map((r) => ({ categoria: r.categoria, subcategoria: r.subcategoria, tipoItem: r.tipo_item, criterio: r.criterio, orden: r.orden })),
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** Todo lo que muestran las pantallas, calculado una vez por carga. */
export interface VistaHistorica {
  datos: DatosHistoricos;
  resumen: ResumenGeneral;
  catalogo: ItemCatalogo[];
  catalogoPorClave: Map<string, ItemCatalogo>;
  documentos: DocumentoConAlcance[];
  proveedores: ProveedorConCifras[];
  /** textoDeLinea de cada línea, en el mismo orden: el buscador no lo rehace en cada tecla. */
  textos: string[];
  /** El N° de documento de cada RUT|tipo|folio, para enlazar una línea con su documento. */
  numeroDeDocumento: Map<string, number>;
}

const VACIA: VistaHistorica = (() => {
  const datos: DatosHistoricos = { importacion: null, lineas: [], documentos: [], proveedores: [], categorias: [], control: CONTROL_VACIO };
  return { datos, resumen: resumirRegistro(datos), catalogo: [], catalogoPorClave: new Map(), documentos: [], proveedores: [], textos: [], numeroDeDocumento: new Map() };
})();

let enMemoria: { id: string; vista: Promise<VistaHistorica> } | null = null;

/** El registro activo con sus cálculos. Sin ninguna carga, una vista vacía (la pantalla invita a importar). */
export async function cargarVista(): Promise<VistaHistorica> {
  const { data, error } = await supabaseAdmin.from(T.importaciones).select("*").eq("estado", "activa").maybeSingle();
  revienta("leer la carga activa", error);
  if (!data) return VACIA;
  if (enMemoria && enMemoria.id === data.id) return enMemoria.vista;

  const imp = aImportacion(data);
  const control = { ...CONTROL_VACIO, ...(data.control ?? {}) } as ControlRegistro;
  const vista = leerDatos(imp, control).then((datos) => {
    const catalogo = armarCatalogo(datos.lineas);
    return {
      datos,
      resumen: resumirRegistro(datos),
      catalogo,
      catalogoPorClave: new Map(catalogo.map((i) => [i.clave, i])),
      documentos: documentosConAlcance(datos.documentos, datos.lineas),
      proveedores: proveedoresConCifras(datos.proveedores, datos.documentos, datos.lineas),
      textos: datos.lineas.map(textoDeLinea),
      numeroDeDocumento: new Map(datos.documentos.map((d) => [claveDocumento(d), d.n])),
    };
  });
  enMemoria = { id: imp.id, vista };
  // Si la lectura falla, no se deja la promesa rechazada en memoria: el próximo pedido reintenta.
  vista.catch(() => {
    if (enMemoria?.vista === vista) enMemoria = null;
  });
  return vista;
}

/**
 * Los nombres y marcas del histórico, para que Inventario los use de referencia de formato.
 * Si el registro no está cargado (o falla), listas vacías: Inventario funciona igual sin ellas.
 */
export async function referenciasHistoricas(): Promise<ReferenciasHistoricas> {
  try {
    const v = await cargarVista();
    return referenciasDe(v.catalogo, v.datos.lineas);
  } catch (e) {
    console.warn("[valorizacion-historica] Sin referencias para Inventario:", e instanceof Error ? e.message : e);
    return REFERENCIAS_VACIAS;
  }
}

// ---------- Importar ------------------------------------------------------------

async function insertarPorPartes(tabla: string, filas: Record<string, unknown>[]): Promise<void> {
  const PARTE = 500;
  for (let i = 0; i < filas.length; i += PARTE) {
    const { error } = await supabaseAdmin.from(tabla).insert(filas.slice(i, i + PARTE));
    revienta(`guardar ${tabla}`, error);
  }
}

/**
 * Guarda una lectura del Excel como la nueva carga activa. Primero se guarda todo bajo una carga
 * «cargando» (nadie la ve) y recién al final se activa de una vez (vh_activar_importacion): si algo
 * falla a mitad de camino, lo que se estaba mirando sigue intacto.
 */
export async function importarRegistro(r: RegistroLeido, archivo: string, correo: string): Promise<Importacion> {
  const fechas = r.lineas.map((l) => l.fecha).sort();
  const { data, error } = await supabaseAdmin
    .from(T.importaciones)
    .insert({
      archivo: archivo.slice(0, 200),
      estado: "cargando",
      desde: fechas[0] ?? null,
      hasta: fechas[fechas.length - 1] ?? null,
      lineas: r.lineas.length,
      documentos: r.documentos.length,
      proveedores: r.proveedores.length,
      monto_total: r.lineas.reduce((s, l) => s + l.valorAjustado, 0),
      control: r.control,
      creado_por: correo,
    })
    .select("*")
    .single();
  revienta("crear la carga", error);
  const id = data!.id as string;

  try {
    await insertarPorPartes(
      T.lineas,
      r.lineas.map((l) => ({
        importacion_id: id,
        n: l.n,
        fecha: l.fecha,
        tipo_documento: l.tipoDocumento,
        folio: l.folio,
        rut: l.rut,
        proveedor: l.proveedor,
        codigo_proveedor: l.codigoProveedor,
        glosa: l.glosa,
        producto: l.producto,
        marca: l.marca,
        modelo: l.modelo,
        talla: l.talla,
        categoria: l.categoria,
        subcategoria: l.subcategoria,
        tipo_item: l.tipoItem,
        cantidad: l.cantidad,
        unidad: l.unidad,
        precio_unitario: l.precioUnitario,
        descuento_linea: l.descuentoLinea,
        valor_linea: l.valorLinea,
        factor_descuento_global: l.factorDescuentoGlobal,
        valor_ajustado: l.valorAjustado,
        costo_unitario: l.costoUnitario,
        estado_cuadratura: l.estadoCuadratura,
        revisar: l.revisar,
        pdf: l.pdf,
        referencias: l.referencias,
        clave: l.clave,
      })),
    );
    await insertarPorPartes(
      T.documentos,
      r.documentos.map((d) => ({
        importacion_id: id,
        n: d.n,
        fecha: d.fecha,
        tipo: d.tipo,
        folio: d.folio,
        rut: d.rut,
        proveedor: d.proveedor,
        direccion: d.direccion,
        comuna: d.comuna,
        contacto_pertec: d.contactoPertec,
        monto_neto: d.montoNeto,
        monto_exento: d.montoExento,
        iva: d.iva,
        impuesto_adicional: d.impuestoAdicional,
        total: d.total,
        estado_cuadratura: d.estadoCuadratura,
        referencias: d.referencias,
        pdf: d.pdf,
      })),
    );
    await insertarPorPartes(
      T.proveedores,
      r.proveedores.map((p) => ({
        importacion_id: id,
        rut: p.rut,
        razon_social: p.razonSocial,
        giro: p.giro,
        direccion: p.direccion,
        comuna: p.comuna,
        email: p.email,
        contacto_pertec: p.contactoPertec,
        categoria_principal: p.categoriaPrincipal,
      })),
    );
    await insertarPorPartes(
      T.categorias,
      r.categorias.map((c) => ({ importacion_id: id, orden: c.orden, categoria: c.categoria, subcategoria: c.subcategoria, tipo_item: c.tipoItem, criterio: c.criterio })),
    );
    const { error: e2 } = await supabaseAdmin.rpc("vh_activar_importacion", { p_id: id });
    revienta("activar la carga", e2);
  } catch (e) {
    // Lo guardado a medias se va con la carga (on delete cascade).
    await supabaseAdmin.from(T.importaciones).delete().eq("id", id);
    throw e;
  }
  enMemoria = null;
  return aImportacion({ ...data, estado: "activa" });
}

/** Vuelve a dejar activa la carga anterior (si el Excel nuevo venía malo). */
export async function volverACargaAnterior(id: string): Promise<void> {
  const { data, error } = await supabaseAdmin.from(T.importaciones).select("id").eq("id", id).eq("estado", "reemplazada").maybeSingle();
  revienta("buscar la carga anterior", error);
  if (!data) throw new Error("[valorizacion-historica] Esa carga ya no está guardada.");
  // vh_activar_importacion activa solo cargas «cargando»: se marca así y se activa en el mismo paso.
  const { error: e1 } = await supabaseAdmin.from(T.importaciones).update({ estado: "cargando" }).eq("id", id);
  revienta("preparar la carga anterior", e1);
  const { error: e2 } = await supabaseAdmin.rpc("vh_activar_importacion", { p_id: id });
  revienta("activar la carga anterior", e2);
  enMemoria = null;
}
