import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { RUTA_COMPRAS, cargarVista, contextoFin } from "@/lib/fin/datos";
import { lineasDeCompra } from "@/lib/fin/oc-datos";
import { apoyoDelEditor } from "@/lib/fin/oc-editor";
import EditorSolicitud, { type DatosEditorSolicitud } from "@/components/fin/EditorSolicitud";

export const dynamic = "force-dynamic";

export default async function EditarSolicitudPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ctx, v] = await Promise.all([contextoFin(), cargarVista()]);
  const c = v.compras.find((x) => x.id === id);
  if (!c) notFound();
  const detalle = `${RUTA_COMPRAS}/${id}`;
  // Solo un borrador o una solicitud devuelta, y solo por su autor, el solicitante o el administrador.
  const yo = ctx.usuario.correo.toLowerCase();
  const esSuya = ctx.usuario.rol === "admin" || (c.solicitante ?? "").toLowerCase() === yo || (c.creadoPor ?? "").toLowerCase() === yo;
  if (!c.formatoOc || c.estadoOverride || c.enviadaAprobacionEn || !esSuya) redirect(detalle);
  const [lineas, apoyo] = await Promise.all([lineasDeCompra(id), apoyoDelEditor(ctx, v)]);

  const inicial: DatosEditorSolicitud = {
    id, codigo: c.codigo, titulo: c.descripcion, solicitanteTipo: c.solicitanteTipo ?? "yo",
    solicitanteUsuarioId: c.solicitanteTipo === "usuario" ? apoyo.personas.find((p) => p.correo.toLowerCase() === (c.solicitante ?? "").toLowerCase())?.id ?? null : null,
    solicitanteOtro: c.solicitanteTipo === "otro" ? c.solicitanteNombre ?? "" : "", proveedorId: c.proveedorId, atencion: c.atencion ?? "", proveedorCorreo: c.proveedorCorreo ?? "",
    proyectoId: c.proyectoId && !v.proyectos.find((p) => p.id === c.proyectoId)?.esGeneral ? c.proyectoId : null, moneda: c.moneda, tipoCambio: c.moneda === "CLP" ? "" : String(c.tipoCambio).replace(".", ","),
    lineas, fechaRequerida: c.fechaRequerida ?? "", entregaLugar: c.entregaLugar ?? "", entregaPlazo: c.entregaPlazo ?? "", formaPago: c.formaPago ?? "",
    condicionPagoDias: c.condicionPagoDias === null ? "" : String(c.condicionPagoDias), observaciones: c.observacionesOc ?? "", condiciones: c.condicionesOc ?? "", devueltaMotivo: c.devueltaMotivo ?? null,
  };
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href={detalle} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> {c.codigo}</Link>
      <header>
        <h2 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Editar {c.codigo}</h2>
        <p className="text-sm text-gris">Corrige lo que haga falta y vuelve a enviarla a aprobación.</p>
      </header>
      <EditorSolicitud inicial={inicial} {...apoyo} />
    </div>
  );
}
