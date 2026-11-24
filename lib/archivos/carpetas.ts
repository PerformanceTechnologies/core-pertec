// Cómo se ordena «ARCHIVOS CORE» en SharePoint. Lo usan las subidas nuevas y el traspaso de
// lo antiguo, así todo queda en el mismo lugar:
//
//   ARCHIVOS CORE/
//     Tareas/<título de la tarea> (<id>)/
//     Flota/<patente>/
//     Inventario/Certificados/<SKU nombre del producto> (<id>)/
//     Inventario/Fotos/<SKU nombre del producto> (<id>)/
//     Gestion financiera/<empresa>/<Movimientos|Documentos|…>/<id>/
//     Rendiciones/<año>/<quién rinde> - <título> (<id>)/
//     Ofertas/Emitidas/ · Ofertas/Imagenes/ · Ofertas/Logos/ · Ofertas/Maestros/
//     Mantencion/Fotos/
//     Proyectos/<proyecto>/Gastos/
//     Firmas de correo/ · Contratos/Logos/
//
// El (<id>) son los primeros 8 caracteres del registro: dos tareas pueden llamarse igual.

const corto = (id: string) => id.replace(/-/g, "").slice(0, 8);

/** Un nombre de carpeta legible y aceptado por SharePoint. */
function legible(texto: string | null | undefined, porDefecto: string): string {
  const t = (texto ?? "")
    .normalize("NFC")
    .replace(/["*:<>?/\\|#%\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 60)
    .trim();
  return t || porDefecto;
}

const ENTIDADES_FIN: Record<string, string> = {
  movimiento: "Movimientos",
  documento: "Documentos",
  compra: "Compras",
  cobro: "Cobros",
  pago: "Pagos",
  hito: "Hitos",
  proyecto: "Proyectos",
  cotizacion: "Cotizaciones",
  oportunidad: "Oportunidades",
  operacion_factoring: "Factoring",
};

export const carpetaTarea = (t: { id: string; titulo?: string | null }) => `Tareas/${legible(t.titulo, "Tarea")} (${corto(t.id)})`;

export const carpetaVehiculo = (v: { id: string; patente?: string | null }) => `Flota/${legible(v.patente, corto(v.id))}`;

export const carpetaCertificado = (p: { id: string; nombre?: string | null; sku?: string | null }) =>
  `Inventario/Certificados/${legible([p.sku, p.nombre].filter(Boolean).join(" "), "Producto")} (${corto(p.id)})`;

export const carpetaFotosProducto = (p: { id: string; nombre?: string | null; sku?: string | null }) =>
  `Inventario/Fotos/${legible([p.sku, p.nombre].filter(Boolean).join(" "), "Producto")} (${corto(p.id)})`;

export const carpetaFinanzas = (empresa: string | null | undefined, entidadTipo: string, entidadId: string) =>
  `Gestion financiera/${legible(empresa, "Empresa")}/${ENTIDADES_FIN[entidadTipo] ?? legible(entidadTipo, "Otros")}/${corto(entidadId)}`;

/** OC emitidas, una carpeta por proveedor: «Gestion financiera/<Empresa>/Ordenes de compra/<Proveedor>». */
export const carpetaOcProveedor = (empresa: string | null | undefined, proveedor: string | null | undefined) =>
  `Gestion financiera/${legible(empresa, "Empresa")}/Ordenes de compra/${legible(proveedor, "Sin proveedor")}`;

/** Cotizaciones de venta emitidas, una carpeta por cliente: «Gestion financiera/<Empresa>/Ventas/<Cliente>». */
export const carpetaVentaCliente = (empresa: string | null | undefined, cliente: string | null | undefined) =>
  `Gestion financiera/${legible(empresa, "Empresa")}/Ventas/${legible(cliente, "Sin cliente")}`;

/** Rendiciones de PERTEC en «Rendiciones/<año>/…»; las de otra empresa en «Rendiciones/<Empresa>/<año>/…». */
export const carpetaRendicion = (r: { id: string; quien?: string | null; titulo?: string | null; creadoEn?: string | null; empresa?: string | null }) =>
  `Rendiciones/${r.empresa ? `${legible(r.empresa, "Empresa")}/` : ""}${(r.creadoEn ?? new Date().toISOString()).slice(0, 4)}/${legible([r.quien, r.titulo].filter(Boolean).join(" - "), "Rendicion")} (${corto(r.id)})`;

export const CARPETA_OFERTAS_EMITIDAS = "Ofertas/Emitidas";
export const CARPETA_OFERTAS_IMAGENES = "Ofertas/Imagenes";
export const CARPETA_OFERTAS_LOGOS = "Ofertas/Logos";
export const CARPETA_OFERTAS_MAESTROS = "Ofertas/Maestros";
export const CARPETA_MANTENCION = "Mantencion/Fotos";
export const CARPETA_FIRMAS = "Firmas de correo";
export const CARPETA_LOGOS_CONTRATOS = "Contratos/Logos";

export const carpetaGastosProyecto = (p?: { nombre?: string | null } | null) =>
  p?.nombre ? `Proyectos/${legible(p.nombre, "Proyecto")}/Gastos` : "Proyectos/Gastos";

/** El nombre del PDF emitido: «<número> <cliente> (<id>).pdf». */
export const nombrePdfEmitido = (o: { id: string; numero?: string | null; cliente?: string | null }) =>
  `${legible([o.numero, o.cliente].filter(Boolean).join(" "), "Oferta")} (${corto(o.id)}).pdf`;

/** Documentos tributarios electrónicos (emitidos y recibidos): «Gestion financiera/<Empresa>/Facturas». */
export const carpetaFacturas = (empresa: string | null | undefined) => `Gestion financiera/${legible(empresa, "Empresa")}/Facturas`;

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** «<base>/Emitidos/2026/03 Marzo» o «<base>/Recibidos/…». Sin fecha: «<base>/Por revisar». */
export function carpetaDte(base: string, clase: "emitido" | "recibido", fechaIso: string | null): string {
  const m = /^(\d{4})-(\d{2})/.exec(fechaIso ?? "");
  if (!m) return `${base}/Por revisar`;
  const mes = Number(m[2]);
  return `${base}/${clase === "emitido" ? "Emitidos" : "Recibidos"}/${m[1]}/${String(mes).padStart(2, "0")} ${MESES[mes - 1] ?? "Mes"}`;
}

const TIPO_CORTO: Record<number, string> = { 33: "Factura", 34: "Factura exenta", 39: "Boleta", 41: "Boleta exenta", 43: "Liquidacion factura", 46: "Factura compra", 52: "Guia despacho", 56: "Nota debito", 61: "Nota credito", 110: "Factura exportacion", 111: "ND exportacion", 112: "NC exportacion" };

/** «2026-03-14_Factura 1234_Cliente SpA» (emitidos) o «…_Proveedor Ltda (76123456-7)» (recibidos), sin extensión. */
export function nombreDte(d: { clase: "emitido" | "recibido"; tipoDte: number | null; folio: string | null; fecha: string | null; contraparte: string | null; rut: string | null }): string {
  const tipo = (d.tipoDte && TIPO_CORTO[d.tipoDte]) || (d.tipoDte ? `DTE ${d.tipoDte}` : "Documento");
  const quien = legible(d.contraparte, d.rut ?? "Sin nombre").slice(0, 50);
  const sufijo = d.clase === "recibido" && d.rut ? ` (${d.rut})` : "";
  return `${d.fecha ?? "sin-fecha"}_${tipo} ${d.folio ?? "s-n"}_${quien}${sufijo}`.replace(/\s+/g, " ").trim();
}
