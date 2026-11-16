import Link from "next/link";
import { IconFolders, IconPlus } from "@tabler/icons-react";
import { RUTA_FIN, cargarVista, contactosDeProyecto, infoProyecto } from "@/lib/fin/datos";
import { clpCorto } from "@/lib/fin/reglas";
import { etiquetaTipoProyecto } from "@/lib/fin/modelo";
import { Banda, Monto, Vacio } from "@/components/fin/piezas";
import { ConVentana } from "@/components/fin/ui";
import { BOTON, BOTON_SEC } from "@/components/fin/estilos";
import FormProyecto from "@/components/fin/FormProyecto";
import CodigoProyecto from "@/components/fin/CodigoProyecto";

export const dynamic = "force-dynamic";

const TONO_TIPO: Record<string, string> = {
  contrato: "bg-sky-500/12 text-sky-700",
  spot: "bg-amber-500/12 text-amber-700",
  arriendo: "bg-emerald-500/12 text-emerald-700",
  interno: "bg-tinta/[0.06] text-tinta/70",
};

const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`);

export default async function ProyectosPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const sp = await searchParams;
  const v = await cargarVista();
  const lista = v.proyectos.filter((p) => (sp.estado === "cerrado" ? p.estado === "cerrado" : p.estado === "activo"));
  const t = (k: "vendido" | "facturado" | "porFacturar" | "porCobrar" | "comprometido" | "margen") => lista.reduce((s, p) => s + p.cifras[k], 0);
  const clientes = contactosDeProyecto(v.contrapartes);
  const tipos = [...new Set(v.proyectos.map((p) => p.tipo))];
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
        <ConVentana boton={<><IconPlus size={15} /> Nuevo proyecto</>} titulo="Nuevo proyecto" className={BOTON}>{<FormProyecto clientes={clientes} tipos={tipos} />}</ConVentana>
      </div>
      {lista.length === 0 ? (
        <Vacio titulo="Todavía no hay proyectos" texto="Se crean solos al aceptar una cotización, o a mano con «Nuevo proyecto». Los gastos sin proyecto van a «General»." icono={<IconFolders size={24} stroke={1.6} />}><Link href={"/leads"} className={BOTON_SEC}>Ir a Leads</Link></Vacio>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-borde/70 bg-superficie shadow-[0_1px_2px_rgba(23,20,17,0.04),0_8px_24px_-12px_rgba(23,20,17,0.12)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[68rem] text-sm">
              <thead>
                <tr className="bg-tinta/[0.025] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gris">
                  <th className="px-5 py-3 text-left">Proyecto</th>
                  <th className="px-3 py-3 text-left">Código</th>
                  <th className="px-3 py-3 text-right">Vendido</th>
                  <th className="px-3 py-3 text-right">Facturado</th>
                  <th className="px-3 py-3 text-right">Por facturar</th>
                  <th className="px-3 py-3 text-right">Por cobrar</th>
                  <th className="px-3 py-3 text-right">Comprometido</th>
                  <th className="px-3 py-3 text-left">Presupuesto</th>
                  <th className="px-5 py-3 text-right">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde/60">
                {lista.map((p) => {
                  const uso = p.presupuestoCostos ? p.cifras.comprometido / p.presupuestoCostos : null;
                  const info = p.esGeneral ? null : infoProyecto(p, v.contrapartes);
                  const sigla = p.mandanteId ? v.contrapartes.find((c) => c.id === p.mandanteId)?.sigla : null;
                  const tono = TONO_TIPO[p.tipo] ?? "bg-tinta/[0.06] text-tinta/70";
                  const cifra = (n: number, fuerte = false) => (
                    <span className={n === 0 ? "text-gris-suave" : fuerte ? "font-semibold text-tinta" : "text-tinta"}><Monto valor={n} /></span>
                  );
                  return (
                    <tr key={p.id} className="group transition-colors hover:bg-naranjo/[0.03]">
                      <td className="px-5 py-3.5">
                        <Link href={`${RUTA_FIN}/proyectos/${p.id}`} className="flex items-center gap-3">
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-mono text-[11px] font-bold ${p.esGeneral ? "bg-tinta/[0.06] text-gris" : "bg-naranjo/10 text-naranjo"}`}>
                            {p.esGeneral ? <IconFolders size={18} stroke={1.75} /> : sigla ?? p.nombre.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-tinta transition group-hover:text-naranjo">{p.nombre}</span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gris">
                              <span className={`rounded-full px-2 py-px text-[10px] font-semibold ${tono}`}>{etiquetaTipoProyecto(p.tipo)}</span>
                              {p.codigo}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3.5">
                        {info ? (
                          <CodigoProyecto info={info} />
                        ) : (
                          <span className="text-gris-suave">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-right">{cifra(p.cifras.vendido, true)}</td>
                      <td className="px-3 py-3.5 text-right">{cifra(p.cifras.facturado)}</td>
                      <td className="px-3 py-3.5 text-right">{cifra(p.cifras.porFacturar)}</td>
                      <td className="px-3 py-3.5 text-right">{cifra(p.cifras.porCobrar)}</td>
                      <td className="px-3 py-3.5 text-right">{cifra(p.cifras.comprometido)}</td>
                      <td className="w-44 px-3 py-3.5">
                        {uso === null ? (
                          <span className="rounded-full bg-tinta/[0.04] px-2 py-0.5 text-[10.5px] text-gris">Sin presupuesto</span>
                        ) : (
                          <>
                            <div className="h-1.5 overflow-hidden rounded-full bg-tinta/[0.06]"><div className={`h-full rounded-full ${uso > 1 ? "bg-rose-500" : uso > 0.85 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, uso * 100)}%` }} /></div>
                            <span className="text-[10px] text-gris">disponible <Monto valor={p.cifras.disponible} corto /></span>
                          </>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {cifra(p.cifras.margen, true)}
                        {p.cifras.margenPct !== null && (
                          <span className={`mt-1 ml-auto block w-fit rounded-full px-1.5 py-px text-[10px] font-semibold ${p.cifras.margenPct < 0 ? "bg-rose-500/10 text-rose-600" : p.cifras.margenPct < 0.15 ? "bg-amber-500/12 text-amber-700" : "bg-emerald-500/12 text-emerald-700"}`}>
                            {pct(p.cifras.margenPct)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
