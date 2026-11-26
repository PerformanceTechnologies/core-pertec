import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { cargarVista, contextoFin, productosInventario } from "@/lib/fin/datos";
import { clientesParaDte, configuracionDte, cotizacionesDe, emisionDeDocumento, guiasDeHitos, obtenerEmision } from "@/lib/fin/dte/servicio";
import { documentoVacio, esTipoEmitible, NOMBRE_DTE, referenciasDeHitos, vencimientoDesde, type DocumentoDte, type LineaDte, type TipoEmitible } from "@/lib/fin/dte/modelo";
import { guardarBorradorDteAction, emitirDteAction } from "@/app/(protegido)/gestion-financiera/acciones-dte";
import EditorDte from "@/components/fin/dte/EditorDte";
import { avisoBloqueo } from "@/components/fin/dte/aviso";

export const dynamic = "force-dynamic";

type Params = { tipo?: string; hitos?: string; ref?: string; refEmision?: string; desde?: string };
const UUID = /^[0-9a-f-]{36}$/;

/**
 * Nuevo documento tributario. Puede nacer vacío o precargado:
 *   ?hitos=a,b      factura (o guía con ?tipo=52) desde hitos «Lista para facturar» de Ventas
 *   ?ref=<doc>      nota de crédito (?tipo=61) o débito (?tipo=56) sobre una factura emitida
 *   ?refEmision=<e> NC/ND sobre un documento de prueba (certificación: no está en Ventas)
 *   ?desde=<emision> copia de un documento ya preparado (p. ej. una prueba)
 */
export default async function NuevoDtePage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const ctx = await contextoFin();
  const [v, cfg, clientes, productos] = await Promise.all([cargarVista(), configuracionDte(ctx.empresa.id), clientesParaDte(ctx.empresa.id), productosInventario(ctx.empresa.id)]);
  let tipo: TipoEmitible = esTipoEmitible(Number(sp.tipo)) ? (Number(sp.tipo) as TipoEmitible) : 33;
  let doc: DocumentoDte = documentoVacio(tipo, v.hoy);
  let clienteId: string | null = null;
  let contexto: string | null = null;
  let tipoFijo = false;
  const origen: { hitoIds?: string[]; documentoReferenciadoId?: string | null } = {};

  const hitoIds = (sp.hitos ?? "").split(",").filter((x) => UUID.test(x));
  const hitos = v.hitos.filter((h) => hitoIds.includes(h.id) && !h.anulado);
  const ref = sp.ref && UUID.test(sp.ref) ? v.documentos.find((d) => d.id === sp.ref && d.direccion === "emitido") : null;

  if (hitos.length) {
    const exentoTotal = hitos.reduce((s, h) => s + (h.exento ?? 0), 0);
    const netoTotal = hitos.reduce((s, h) => s + h.neto, 0);
    if (tipo !== 52) tipo = exentoTotal >= netoTotal ? 34 : 33;
    const lineas: LineaDte[] = hitos.flatMap((h) => {
      const detalle = [h.periodo, h.codigo, h.proyectoNombre].filter(Boolean).join(" · ") || null;
      const afecto = h.neto - (h.exento ?? 0);
      const base = { descripcion: detalle, cantidad: 1, unidad: "UN", descuentoPct: 0, codigo: h.codigo };
      const xs: LineaDte[] = [];
      if (afecto > 0 || (h.exento ?? 0) === 0) xs.push({ ...base, nombre: h.descripcion.slice(0, 80), precio: tipo === 52 && h.tipo === "arriendo" ? 0 : afecto, exento: tipo === 34 });
      if ((h.exento ?? 0) > 0) xs.push({ ...base, nombre: `${h.descripcion}`.slice(0, 74) + " (exento)", precio: h.exento ?? 0, exento: true });
      return xs;
    });
    clienteId = hitos[0].clienteId;
    const condicion = hitos[0].condicion;
    const [guias, cotizaciones] = await Promise.all([
      tipo === 52 ? Promise.resolve([]) : guiasDeHitos(ctx.empresa.id, cfg.ambiente, hitos.map((h) => h.id), v.documentos),
      cotizacionesDe(ctx.empresa.id, [...new Set(hitos.map((h) => h.cotizacionId).filter((x): x is string => Boolean(x)))]),
    ]);
    doc = {
      ...documentoVacio(tipo, v.hoy),
      lineas,
      referencias: referenciasDeHitos(hitos, v.hoy, { paraGuia: tipo === 52, guias, cotizaciones }),
      fechaVencimiento: tipo === 52 ? null : vencimientoDesde(v.hoy, condicion),
      indTraslado: tipo === 52 ? (hitos[0].tipo === "venta" ? 1 : 6) : null,
    };
    origen.hitoIds = hitos.map((h) => h.id);
    contexto = `${hitos.length === 1 ? "Hito" : "Hitos"} ${hitos.map((h) => h.codigo).join(", ")} · ${hitos[0].clienteNombre ?? "sin cliente"}`;
    tipoFijo = tipo === 52;
  } else if (ref) {
    tipo = tipo === 56 ? 56 : 61;
    clienteId = ref.contraparteId;
    // Si la factura salió por el Core, la NC parte con sus mismas líneas; si no, con una línea por el total.
    const emId = ref.origen === "api_dte" ? await emisionDeDocumento(ctx.empresa.id, ref.id) : null;
    const em = emId ? await obtenerEmision(ctx.empresa.id, emId) : null;
    const lineas: LineaDte[] = tipo === 61 && em
      ? em.documento.lineas
      : [
          ...(ref.neto > 0 ? [{ nombre: `${tipo === 61 ? "Anula" : "Ajuste"} factura N° ${ref.folio}`, descripcion: null, cantidad: 1, unidad: "UN", precio: tipo === 61 ? ref.neto : 0, descuentoPct: 0, exento: false, codigo: null }] : []),
          ...(ref.exento > 0 ? [{ nombre: `${tipo === 61 ? "Anula" : "Ajuste"} factura N° ${ref.folio} (exento)`, descripcion: null, cantidad: 1, unidad: "UN", precio: tipo === 61 ? ref.exento : 0, descuentoPct: 0, exento: true, codigo: null }] : []),
        ];
    doc = {
      ...documentoVacio(tipo, v.hoy),
      lineas,
      formaPago: tipo === 61 ? 1 : 2,
      referencias: [{ tipo: String(ref.tipoDte), folio: ref.folio, fecha: ref.fechaEmision, codRef: tipo === 61 ? 1 : 3, razon: tipo === 61 ? `Anula factura N° ${ref.folio}` : null }],
    };
    origen.documentoReferenciadoId = ref.id;
    contexto = `${tipo === 61 ? "Corrige" : "Aumenta"} la ${NOMBRE_DTE[ref.tipoDte]?.toLowerCase() ?? "factura"} N° ${ref.folio} · ${ref.razonSocial ?? ""}`;
    tipoFijo = true;
  } else if (sp.refEmision && UUID.test(sp.refEmision)) {
    const em = await obtenerEmision(ctx.empresa.id, sp.refEmision);
    if (em?.folio) {
      tipo = tipo === 56 ? 56 : 61;
      clienteId = em.contraparteId;
      doc = {
        ...documentoVacio(tipo, v.hoy),
        lineas: tipo === 61 ? em.documento.lineas : [],
        formaPago: tipo === 61 ? 1 : 2,
        referencias: [{ tipo: String(em.tipoDte), folio: em.folio, fecha: em.fechaEmision, codRef: tipo === 61 ? 1 : 3, razon: tipo === 61 ? `Anula ${NOMBRE_DTE[em.tipoDte].toLowerCase()} N° ${em.folio}` : null }],
      };
      contexto = `${tipo === 61 ? "Corrige" : "Aumenta"} ${NOMBRE_DTE[em.tipoDte].toLowerCase()} N° ${em.folio} (prueba)`;
      tipoFijo = true;
    }
  } else if (sp.desde && UUID.test(sp.desde)) {
    const em = await obtenerEmision(ctx.empresa.id, sp.desde);
    if (em) {
      tipo = em.tipoDte;
      doc = { ...em.documento, fechaEmision: v.hoy };
      clienteId = em.contraparteId;
      contexto = `Copia de ${NOMBRE_DTE[em.tipoDte]}${em.folio ? ` N° ${em.folio}` : ""}`;
    }
  }

  const cliente = clientes.find((c) => c.id === clienteId);
  if (cliente) doc.receptor = { rut: cliente.rut ?? "", razonSocial: cliente.razonSocial, giro: cliente.giro, direccion: cliente.direccion, comuna: cliente.comuna, ciudad: cliente.ciudad, contacto: null, correo: null };
  const origenJson = JSON.stringify(origen);

  return (
    <div className="space-y-4">
      <Link href="/finanzas/facturacion" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> Facturación electrónica</Link>
      <h1 className="text-xl font-extrabold text-tinta">Nuevo documento</h1>
      <EditorDte
        inicial={doc}
        clientes={clientes}
        catalogo={productos.map((p) => ({ id: p.id, nombre: p.nombre, sku: p.sku, tipo: p.tipo, unidad: p.unidad, valor: p.precio }))}
        clienteInicial={clienteId}
        tasaIva={cfg.tasaIva}
        hoy={v.hoy}
        ambiente={cfg.ambiente}
        activo={cfg.configurado && cfg.emisionHabilitada && cfg.activo}
        tipoFijo={tipoFijo}
        contexto={contexto}
        guardar={guardarBorradorDteAction.bind(null, null, origenJson)}
        emitir={emitirDteAction.bind(null, null, origenJson)}
        bloqueado={avisoBloqueo(cfg)}
      />
    </div>
  );
}
