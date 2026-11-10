import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { RUTA_LEADS, cargarComercial, cargarVistaLeads, productosInventario } from "@/lib/fin/datos";
import EditorCotizacion from "@/components/leads/EditorCotizacion";

export const dynamic = "force-dynamic";

export default async function NuevaCotizacionPage({ searchParams }: { searchParams: Promise<{ oportunidad?: string }> }) {
  const sp = await searchParams;
  const [v, com, productos] = await Promise.all([cargarVistaLeads(), cargarComercial(), productosInventario()]);
  const op = com.oportunidades.find((o) => o.id === sp.oportunidad);
  const perfil = op?.clienteId ? v.perfiles.get(op.clienteId) : undefined;
  return (
    <div className="space-y-4">
      <Link href={`${RUTA_LEADS}?ver=cotizaciones`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> Cotizaciones</Link>
      <h2 className="text-lg font-extrabold text-tinta">Nueva cotización</h2>
      <EditorCotizacion
        inicial={{
          id: null, titulo: op?.nombre ?? "", clienteId: op?.clienteId ?? null, oportunidadId: op?.id ?? null, proyectoId: op?.proyectoId ?? null, tipo: op?.tipo ?? "servicio",
          fecha: v.hoy, validezDias: 30, condicionPagoDias: perfil?.condicionVentaDias ?? null, requiereOc: perfil?.requiereOc ?? true, requiereEdp: perfil?.requiereEdp ?? false,
          requiereHes: perfil?.requiereHes ?? false, notas: null, atencion: op?.contactoNombre ?? null, correoAtencion: op?.contactoCorreo ?? null, plazoEntrega: null, formaPago: null, descuentoGeneralTipo: null, descuentoGeneralValor: 0, incluirDatosPago: false,
          lineas: [{ productoId: null, descripcion: op?.nombre ?? "", cantidad: 1, unidad: "un", precioUnitario: op?.montoEstimado ?? 0, descuentoPct: 0, exento: false, meses: op?.tipo === "arriendo" ? 1 : null }],
        }}
        clientes={v.contrapartes.map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut }))}
        perfiles={Object.fromEntries([...v.perfiles.values()].map((p) => [p.contactoId, { condicion: p.condicionVentaDias, oc: p.requiereOc, edp: p.requiereEdp, hes: p.requiereHes }]))}
        productos={productos}
        proyectos={v.proyectos.filter((p) => p.estado === "activo" && !p.esGeneral).map((p) => ({ id: p.id, nombre: p.nombre }))}
        oportunidades={com.oportunidades.filter((o) => !["ganada", "perdida"].includes(o.etapa)).map((o) => ({ id: o.id, nombre: o.nombre }))}
        tasaIva={v.p.tasaIva}
      />
    </div>
  );
}
