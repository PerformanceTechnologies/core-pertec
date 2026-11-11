import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconHistory, IconTrash } from "@tabler/icons-react";
import { RUTA_COMPRAS, cargarVista, contextoFin, historialDeCompra } from "@/lib/fin/datos";
import { clp, fechaCl } from "@/lib/fin/reglas";
import { DTE_CORTO } from "@/lib/fin/modelo";
import { TARJETA } from "@/lib/estilos";
import { eliminarCompraAction } from "@/app/(protegido)/gestion-financiera/acciones-compras";
import { Chip, Monto, Seccion, TD, TH, tonoPaso } from "@/components/fin/piezas";
import { BotonAccion } from "@/components/fin/ui";

export const dynamic = "force-dynamic";

const ETIQUETA_ACCION: Record<string, string> = {
  crear: "Creada", editar: "Editada", aprobar: "Aprobada", visar: "Visada", rechazar: "Rechazada", anular: "Anulada", oc_enviada: "OC enviada",
  recepcion: "Recepción", diferencia: "Diferencia aceptada", programar: "Pago programado", pagar: "Pago hecho",
};

const cuando = (iso: string) => new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });

export default async function CompraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v, ctx] = await Promise.all([cargarVista(), contextoFin()]);
  const c = v.compras.find((x) => x.id === id);
  if (!c) notFound();
  const facturas = v.documentos.filter((d) => d.compraIds.includes(id));
  const idsFacturas = new Set(facturas.map((d) => d.id));
  const pagos = v.pagos.filter((p) => p.aplicaciones.some((a) => idsFacturas.has(a.documentoId)));
  const historial = await historialDeCompra(ctx.empresa.id, id, [...idsFacturas], pagos.map((p) => p.id));
  const quien = (u: string | null) => u?.split("@")[0] ?? "—";

  // Quién hizo cada paso que pasa por personas: puede haber más de uno (titular y suplentes).
  const personas = [
    { rotulo: "Solicitó", acciones: ["crear"] },
    { rotulo: "Aprobó", acciones: ["aprobar"] },
    { rotulo: "Visó", acciones: ["visar"] },
    { rotulo: "Recibió", acciones: ["recepcion"] },
    { rotulo: "Pagó", acciones: ["pagar"] },
  ].map((p) => ({ ...p, eventos: historial.filter((h) => p.acciones.includes(h.accion)) }));

  return (
    <div className="space-y-6">
      <Link href={RUTA_COMPRAS} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> Compras y pagos</Link>

      <header className={`${TARJETA} flex flex-wrap items-start gap-4 p-5`}>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gris">{c.codigo} · {c.proyectoNombre ?? "General"}{c.ocNumero ? ` · ${c.ocNumero}` : ""}</p>
          <h2 className="text-lg font-extrabold text-tinta">{c.descripcion}</h2>
          <p className="text-sm text-gris">{c.proveedorNombre ?? "Sin proveedor"} · neto cotizado {clp(c.netoCotizado ?? 0)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip texto={c.estadoOverride ? (c.estadoOverride === "rechazada" ? "Rechazada" : "Anulada") : c.paso} tono={tonoPaso(c.paso)} />
            {c.motivo && <span className="text-xs text-gris">Motivo: {c.motivo}</span>}
          </div>
        </div>
        {/* Solo el administrador del sistema (la acción lo vuelve a exigir en el servidor). */}
        {ctx.usuario.rol === "admin" && (
          <BotonAccion
            accion={eliminarCompraAction.bind(null, id)}
            motivo={`¿Por qué se elimina ${c.codigo}?`}
            titulo="Eliminar (solo administrador)"
            volverA={RUTA_COMPRAS}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/[0.06] px-3 py-2 text-xs font-semibold text-alerta transition hover:bg-rose-500/[0.12] disabled:opacity-50"
          >
            <IconTrash size={14} /> Eliminar solicitud
          </BotonAccion>
        )}
      </header>

      <Seccion titulo="Quién hizo qué">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {personas.map((p) => (
            <div key={p.rotulo} className={`${TARJETA} p-3`}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gris">{p.rotulo}</p>
              {p.eventos.length === 0 ? <p className="mt-1 text-sm text-gris-suave">Pendiente</p> : p.eventos.map((e) => (
                <p key={e.id} className="mt-1 text-sm"><span className="font-semibold text-tinta">{quien(e.usuario)}</span><span className="block text-[11px] text-gris">{cuando(e.creadoEn)}</span></p>
              ))}
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Historial" icono={<IconHistory size={15} />}>
        <ol className={`${TARJETA} divide-y divide-borde text-sm`}>
          {historial.map((x) => (
            <li key={x.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5">
              <span className="w-36 shrink-0 text-xs tabular-nums text-gris">{cuando(x.creadoEn)}</span>
              <span className="w-28 shrink-0"><Chip texto={ETIQUETA_ACCION[x.accion] ?? x.accion} tono="bg-tinta/[0.06] text-tinta" />{x.sobre !== "compra" && <span className="ml-1 text-[10px] text-gris">{x.sobre === "factura" ? "factura" : "pago"}</span>}</span>
              <span className="min-w-0 flex-1 text-tinta">{x.detalle ?? x.accion}{x.motivo && <span className="block text-xs text-gris">Motivo: {x.motivo}</span>}</span>
              <span className="text-xs font-semibold text-gris">{quien(x.usuario)}</span>
            </li>
          ))}
          {historial.length === 0 && <li className="px-4 py-3 text-gris">Sin movimientos registrados (la solicitud es anterior al historial).</li>}
        </ol>
      </Seccion>

      {facturas.length > 0 && (
        <Seccion titulo="Facturas">
          <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-borde"><th className={TH}>Documento</th><th className={TH}>Emisión / vence</th><th className={`${TH} text-right`}>Total</th><th className={`${TH} text-right`}>Saldo</th></tr></thead>
              <tbody className="divide-y divide-borde">
                {facturas.map((d) => (
                  <tr key={d.id} className={d.estado === "anulado" ? "opacity-50" : ""}>
                    <td className={TD}><span className="rounded bg-tinta/[0.06] px-1.5 py-0.5 text-[10px] font-bold">{DTE_CORTO[d.tipoDte] ?? d.tipoDte}</span> <span className="font-semibold text-tinta">{d.folio}</span></td>
                    <td className={`${TD} text-xs text-gris`}>{fechaCl(d.fechaEmision)} · vence {fechaCl(d.fechaVencimiento)}</td>
                    <td className={`${TD} text-right font-semibold`}><Monto valor={d.total} /></td>
                    <td className={`${TD} text-right`}><Monto valor={d.saldo} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}
    </div>
  );
}
