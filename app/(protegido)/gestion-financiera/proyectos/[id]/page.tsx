import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { RUTA_FIN, cargarVista } from "@/lib/fin/datos";
import { clp, clpCorto, fechaCl } from "@/lib/fin/reglas";
import { ETIQUETA_TIPO_PROYECTO } from "@/lib/fin/modelo";
import { TARJETA } from "@/lib/estilos";
import { Chip, Kpi, Monto, Seccion, TD, TH, TONO_ETAPA, tonoPaso } from "@/components/fin/piezas";
import { BOTON_SEC, ConVentana } from "@/components/fin/ui";
import FormProyecto from "@/components/fin/FormProyecto";

export const dynamic = "force-dynamic";

const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`);

export default async function ProyectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await cargarVista();
  const p = v.proyectos.find((x) => x.id === id);
  if (!p) notFound();
  const hitos = v.hitos.filter((h) => h.proyectoId === id);
  const compras = v.compras.filter((c) => c.proyectoId === id);
  const movs = v.movimientos.filter((m) => m.proyectoId === id);
  const c = p.cifras;
  return (
    <div className="space-y-6">
      <Link href={`${RUTA_FIN}/proyectos`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> Proyectos</Link>
      <header className={`${TARJETA} flex flex-wrap items-start gap-4 p-5`}>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gris">{p.codigo} · {ETIQUETA_TIPO_PROYECTO[p.tipo]} · {p.estado}</p>
          <h2 className="text-lg font-extrabold text-tinta">{p.nombre}</h2>
          <p className="text-sm text-gris">{p.mandanteId ? v.nombreDe.get(p.mandanteId) : p.esGeneral ? "Interno" : "Sin mandante"}{p.jefeProyecto ? ` · JP ${p.jefeProyecto}` : ""}{p.fechaInicio ? ` · ${fechaCl(p.fechaInicio)} → ${fechaCl(p.fechaTermino)}` : ""}</p>
          {p.descripcion && <p className="mt-1 text-sm text-tinta">{p.descripcion}</p>}
        </div>
        <ConVentana boton="Editar" titulo={`Editar ${p.nombre}`} className={BOTON_SEC}>{(cerrar) => <FormProyecto p={p} clientes={v.contrapartes.map((x) => ({ id: x.id, nombre: x.nombre, rut: x.rut }))} alOk={cerrar} />}</ConVentana>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi etiqueta="Vendido" valor={clpCorto(c.vendido)} />
        <Kpi etiqueta="Facturado" valor={clpCorto(c.facturado)} />
        <Kpi etiqueta="Por facturar" valor={clpCorto(c.porFacturar)} />
        <Kpi etiqueta="Por cobrar" valor={clpCorto(c.porCobrar)} />
        <Kpi etiqueta="Comprometido" valor={clpCorto(c.comprometido)} />
        <Kpi etiqueta="Presupuesto disponible" valor={c.disponible === null ? "Sin presupuesto" : clpCorto(c.disponible)} tono={c.disponible !== null && c.disponible < 0 ? "text-alerta" : "text-tinta"} />
        <Kpi etiqueta="Margen" valor={pct(c.margenPct)} detalle={clp(c.margen)} tono={(c.margenPct ?? 1) < 0.2 ? "text-alerta" : "text-ok"} ayuda="Vendido − compras comprometidas (sin mano de obra propia aún)" />
      </div>
      <Seccion titulo={`Hitos (${hitos.length})`}>
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
          <table className="w-full min-w-[44rem] text-sm">
            <thead><tr className="border-b border-borde"><th className={TH}>Hito</th><th className={TH}>Etapa</th><th className={`${TH} text-right`}>Neto</th><th className={TH}>Factura</th><th className={`${TH} text-right`}>Saldo</th></tr></thead>
            <tbody className="divide-y divide-borde">{hitos.map((h) => <tr key={h.id}><td className={TD}><Link href={`${RUTA_FIN}/ventas/hito/${h.id}`} className="font-semibold hover:text-naranjo">{h.codigo} · {h.periodo ?? h.descripcion}</Link></td><td className={TD}><Chip texto={h.etapa} tono={TONO_ETAPA[h.etapa]} /></td><td className={`${TD} text-right`}><Monto valor={h.neto} /></td><td className={`${TD} text-xs`}>{h.factura ? `N° ${h.factura.folio}` : "—"}</td><td className={`${TD} text-right`}><Monto valor={h.saldo} /></td></tr>)}</tbody>
          </table>
          {hitos.length === 0 && <p className="p-6 text-center text-xs text-gris">Sin hitos.</p>}
        </div>
      </Seccion>
      <Seccion titulo={`Compras (${compras.length})`}>
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
          <table className="w-full min-w-[44rem] text-sm">
            <thead><tr className="border-b border-borde"><th className={TH}>Compra</th><th className={TH}>Siguiente paso</th><th className={TH}>Proveedor</th><th className={`${TH} text-right`}>Comprometido</th></tr></thead>
            <tbody className="divide-y divide-borde">{compras.map((x) => <tr key={x.id}><td className={TD}><Link href={`${RUTA_FIN}/compras?q=${x.codigo}`} className="font-semibold hover:text-naranjo">{x.codigo}</Link> · {x.descripcion}</td><td className={TD}><Chip texto={x.paso} tono={tonoPaso(x.paso)} /></td><td className={`${TD} max-w-[12rem] truncate`}>{x.proveedorNombre ?? "—"}</td><td className={`${TD} text-right`}><Monto valor={x.comprometidoNeto} /></td></tr>)}</tbody>
          </table>
          {compras.length === 0 && <p className="p-6 text-center text-xs text-gris">Sin compras.</p>}
        </div>
      </Seccion>
      {movs.length > 0 && (
        <Seccion titulo={`Movimientos del banco y tarjeta (${movs.length})`}>
          <ul className={`${TARJETA} divide-y divide-borde text-sm`}>{movs.map((m) => <li key={m.id} className="flex gap-3 px-4 py-2"><span className="w-20 text-xs text-gris">{fechaCl(m.fecha)}</span><span className="flex-1 truncate">{m.glosa}</span><span className="text-xs text-gris">{m.categoriaNombre}</span><Monto valor={m.monto} /></li>)}</ul>
        </Seccion>
      )}
    </div>
  );
}
