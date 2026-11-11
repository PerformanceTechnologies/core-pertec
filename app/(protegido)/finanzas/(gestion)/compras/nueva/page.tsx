import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { RUTA_COMPRAS, cargarVista, contextoFin } from "@/lib/fin/datos";
import { apoyoDelEditor } from "@/lib/fin/oc-editor";
import EditorSolicitud, { type DatosEditorSolicitud } from "@/components/fin/EditorSolicitud";

export const dynamic = "force-dynamic";

const VACIA: DatosEditorSolicitud = {
  id: null, codigo: null, titulo: "", solicitanteTipo: "yo", solicitanteUsuarioId: null, solicitanteOtro: "", proveedorId: null, atencion: "", proveedorCorreo: "", proyectoId: null,
  moneda: "CLP", tipoCambio: "", lineas: [], fechaRequerida: "", entregaLugar: "", entregaPlazo: "", formaPago: "Transferencia", condicionPagoDias: "30", observaciones: "",
  condiciones: "", devueltaMotivo: null,
};

export default async function NuevaSolicitudPage() {
  const [ctx, v] = await Promise.all([contextoFin(), cargarVista()]);
  const apoyo = await apoyoDelEditor(ctx, v);
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href={RUTA_COMPRAS} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> Compras y pagos</Link>
      <header>
        <h2 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Nueva solicitud de compra</h2>
        <p className="text-sm text-gris">Completa los datos de la orden de compra. Puedes guardarla como borrador y seguir después; al enviarla a aprobación le llega a quien corresponde.</p>
      </header>
      <EditorSolicitud inicial={VACIA} {...apoyo} />
    </div>
  );
}
