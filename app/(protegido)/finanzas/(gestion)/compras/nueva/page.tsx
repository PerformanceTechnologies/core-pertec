import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { RUTA_COMPRAS, cargarVista, contextoFin } from "@/lib/fin/datos";
import { apoyoDelEditor } from "@/lib/fin/oc-editor";
import { solicitudCotizacion } from "@/lib/fin/solicitud-cotizacion";
import EditorSolicitud, { type DatosEditorSolicitud } from "@/components/fin/EditorSolicitud";

export const dynamic = "force-dynamic";

const VACIA: DatosEditorSolicitud = {
  id: null, codigo: null, titulo: "", solicitanteTipo: "yo", solicitanteUsuarioId: null, solicitanteOtro: "", proveedorId: null, atencion: "", proveedorCorreo: "", proyectoId: null,
  moneda: "CLP", tipoCambio: "", lineas: [], fechaRequerida: "", entregaLugar: "", entregaPlazo: "", formaPago: "Transferencia", condicionPagoDias: "30", observaciones: "",
  condiciones: "", devueltaMotivo: null,
};

export default async function NuevaSolicitudPage({ searchParams }: { searchParams: Promise<{ desde?: string }> }) {
  const sp = await searchParams;
  const [ctx, v] = await Promise.all([contextoFin(), cargarVista()]);
  const [apoyo, sc] = await Promise.all([apoyoDelEditor(ctx, v), sp.desde ? solicitudCotizacion(ctx, sp.desde) : Promise.resolve(null)]);
  // Desde una solicitud de cotización: proveedor, ítems y el lead ya vienen puestos; falta poner los precios que cotizaron.
  const inicial: DatosEditorSolicitud = sc
    ? {
        ...VACIA,
        titulo: sc.asunto.replace(/^Solicitud de cotización\s*·?\s*/i, "") || sc.asunto,
        proveedorId: sc.contactoId,
        proveedorCorreo: sc.correo.split(",")[0]?.trim() ?? "",
        lineas: sc.items.map((i) => ({ productoId: null, descripcion: i.descripcion, cantidad: i.cantidad || 1, unidad: i.unidad || null, precioUnitario: 0, descuentoPct: 0, exento: false, nota: null })),
        oportunidadId: sc.oportunidadId,
        solicitudCotizacionId: sc.id,
        origen: `Viene de la solicitud de cotización ${sc.codigo}${sc.oportunidadCodigo ? ` y queda enlazada al lead ${sc.oportunidadCodigo}` : ""}. Completa los precios que cotizaron (o sube la cotización y la IA la lee).`,
      }
    : VACIA;
  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <Link href={RUTA_COMPRAS} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> Compras y pagos</Link>
      <header>
        <h2 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Nueva solicitud de compra</h2>
        <p className="text-sm text-gris">Completa los datos de la orden de compra. Puedes guardarla como borrador y seguir después; al enviarla a aprobación le llega a quien corresponde.</p>
      </header>
      <EditorSolicitud inicial={inicial} {...apoyo} />
    </div>
  );
}
