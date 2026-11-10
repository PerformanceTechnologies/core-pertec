import Link from "next/link";
import { IconFolders, IconPlus } from "@tabler/icons-react";
import { RUTA_FIN, cargarVista } from "@/lib/fin/datos";
import { clpCorto } from "@/lib/fin/reglas";
import { ETIQUETA_TIPO_PROYECTO } from "@/lib/fin/modelo";
import { Banda, Monto, TD, TH, Vacio } from "@/components/fin/piezas";
import { ConVentana } from "@/components/fin/ui";
import { BOTON, BOTON_SEC } from "@/components/fin/estilos";
import FormProyecto from "@/components/fin/FormProyecto";

export const dynamic = "force-dynamic";

const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`);

export default async function ProyectosPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const sp = await searchParams;
  const v = await cargarVista();
  const lista = v.proyectos.filter((p) => (sp.estado === "cerrado" ? p.estado === "cerrado" : p.estado === "activo"));
  const t = (k: "vendido" | "facturado" | "porFacturar" | "porCobrar" | "comprometido" | "margen") => lista.reduce((s, p) => s + p.cifras[k], 0);
  const clientes = v.contrapartes.map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut }));
  return (
    <div className="space-y-5">
      <Banda
        etiqueta="Proyectos"
        valor={clpCorto(t("vendido"))}
        bajada="Vendido neto (cotizaciones aceptadas). Todo lo de la derecha se calcula desde los hitos y las compras de cada proyecto; el presupuesto es opcional."
        cifras={[
          { etiqueta: "Por facturar", valor: clpCorto(t("porFacturar")) },
          { etiqueta: "Por cobrar", valor: clpCorto(t("porCobrar")) },
          { etiqueta: "Comprometido", valor: clpCorto(t("comprometido")) },
          { etiqueta: "Margen", valor: clpCorto(t("margen")), detalle: pct(t("vendido") ? t("margen") / t("vendido") : null) },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`${RUTA_FIN}/proyectos`} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${sp.estado !== "cerrado" ? "border-tinta bg-tinta text-superficie" : "border-borde text-gris"}`}>Activos</Link>
        <Link href={`${RUTA_FIN}/proyectos?estado=cerrado`} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${sp.estado === "cerrado" ? "border-tinta bg-tinta text-superficie" : "border-borde text-gris"}`}>Cerrados</Link>
        <span className="flex-1" />
        <ConVentana boton={<><IconPlus size={15} /> Nuevo proyecto</>} titulo="Nuevo proyecto" className={BOTON}>{<FormProyecto clientes={clientes} />}</ConVentana>
      </div>
      {lista.length === 0 ? (
        <Vacio titulo="Todavía no hay proyectos" texto="Se crean solos al aceptar una cotización, o a mano con «Nuevo proyecto». Los gastos sin proyecto van a «General»." icono={<IconFolders size={24} stroke={1.6} />}><Link href={"/leads"} className={BOTON_SEC}>Ir a Leads</Link></Vacio>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
          <table className="w-full min-w-[80rem] text-sm">
            <thead><tr className="border-b border-borde"><th className={TH}>Proyecto</th><th className={TH}>Mandante</th><th className={`${TH} text-right`}>Vendido</th><th className={`${TH} text-right`}>Facturado</th><th className={`${TH} text-right`}>Por facturar</th><th className={`${TH} text-right`}>Por cobrar</th><th className={`${TH} text-right`}>Comprometido</th><th className={TH}>Presupuesto</th><th className={`${TH} text-right`}>Margen</th></tr></thead>
            <tbody className="divide-y divide-borde">
              {lista.map((p) => {
                const uso = p.presupuestoCostos ? p.cifras.comprometido / p.presupuestoCostos : null;
                return (
                  <tr key={p.id} className="hover:bg-tinta/[0.02]">
                    <td className={TD}><Link href={`${RUTA_FIN}/proyectos/${p.id}`} className="font-semibold text-tinta hover:text-naranjo">{p.nombre}</Link><span className="block text-[11px] text-gris">{p.codigo} · {ETIQUETA_TIPO_PROYECTO[p.tipo]}{p.jefeProyecto ? ` · ${p.jefeProyecto}` : ""}</span></td>
                    <td className={`${TD} max-w-[12rem] truncate`}>{p.esGeneral ? "Interno" : p.mandanteId ? v.nombreDe.get(p.mandanteId) : "—"}</td>
                    <td className={`${TD} text-right`}><Monto valor={p.cifras.vendido} /></td>
                    <td className={`${TD} text-right`}><Monto valor={p.cifras.facturado} /></td>
                    <td className={`${TD} text-right`}><Monto valor={p.cifras.porFacturar} /></td>
                    <td className={`${TD} text-right`}><Monto valor={p.cifras.porCobrar} /></td>
                    <td className={`${TD} text-right`}><Monto valor={p.cifras.comprometido} /></td>
                    <td className={`${TD} w-44`}>
                      {uso === null ? <span className="text-[11px] text-gris">Sin presupuesto</span> : (
                        <>
                          <div className="h-1.5 overflow-hidden rounded-full bg-tinta/[0.06]"><div className={`h-full rounded-full ${uso > 1 ? "bg-rose-500" : uso > 0.85 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, uso * 100)}%` }} /></div>
                          <span className="text-[10px] text-gris">disponible <Monto valor={p.cifras.disponible} corto /></span>
                        </>
                      )}
                    </td>
                    <td className={`${TD} text-right`}><Monto valor={p.cifras.margen} /><span className="block text-[10px] text-gris">{pct(p.cifras.margenPct)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
