"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconChevronRight, IconReceipt2, IconSearch, IconTrash } from "@tabler/icons-react";
import { CAMPO, TARJETA } from "@/lib/estilos";
import { esEditable, saldoRendicion } from "@/lib/permisos-rendidor";
import type { EstadoRendicion, ResumenRendicion } from "@/lib/rendidor/tipos";
import { ChipEstadoRendicion, ESTILO_ESTADO_RENDICION, money } from "@/components/rendidor/Visual";
import type { Resultado } from "@/app/(protegido)/rendir-gastos/acciones";

type Filtro = "todas" | EstadoRendicion;

const FILTROS: { k: Filtro; texto: string }[] = [
  { k: "todas", texto: "Todas" },
  { k: "borrador", texto: "Borradores" },
  { k: "enviada", texto: "En revisión" },
  { k: "rechazada", texto: "Rechazadas" },
  { k: "aprobada", texto: "Por pagar" },
  { k: "pagada", texto: "Pagadas" },
  { k: "cargada_odoo", texto: "Históricas" },
];

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });

/** La lista de rendiciones con filtros por estado, búsqueda y, para quien revisa, «solo mías». */
export default function ListaRendiciones({
  rendiciones,
  revisa,
  filtroInicial = "todas",
  borrar,
}: {
  rendiciones: ResumenRendicion[];
  revisa: boolean;
  filtroInicial?: Filtro;
  borrar: (id: string) => Promise<Resultado>;
}) {
  const [filtro, setFiltro] = useState<Filtro>(filtroInicial);
  const [buscar, setBuscar] = useState("");
  const [soloMias, setSoloMias] = useState(false);
  const q = buscar.trim().toLowerCase();

  const base = rendiciones.filter((r) => !soloMias || r.esMia);
  const visibles = base
    .filter((r) => filtro === "todas" || r.estado === filtro)
    .filter((r) => !q || `${r.tituloRendicion} ${r.nombreQuienRinde}`.toLowerCase().includes(q));
  const cuenta = (k: Filtro) => (k === "todas" ? base.length : base.filter((r) => r.estado === k).length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.filter((f) => f.k === "todas" || cuenta(f.k) > 0 || f.k === filtro).map((f) => (
            <button
              key={f.k}
              type="button"
              onClick={() => setFiltro(f.k)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                filtro === f.k ? "border-tinta bg-tinta text-superficie" : "border-borde bg-superficie text-gris hover:border-naranjo/50 hover:text-tinta"
              }`}
            >
              {f.texto} <span className="opacity-60">{cuenta(f.k)}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex w-full flex-wrap items-center gap-3 sm:w-auto">
          {revisa && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-gris">
              <input type="checkbox" checked={soloMias} onChange={(e) => setSoloMias(e.target.checked)} className="accent-naranjo" />
              Solo mías
            </label>
          )}
          <div className="relative w-full sm:w-64">
            <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris" />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por título o persona" className={`${CAMPO} pl-9`} />
          </div>
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className={`${TARJETA} flex flex-col items-center gap-2 px-6 py-12 text-center`}>
          <IconReceipt2 size={32} stroke={1.5} className="text-gris-suave" />
          <p className="text-sm text-gris">{rendiciones.length === 0 ? "Todavía no hay rendiciones. Crea la primera con «Nueva rendición»." : "Ninguna rendición en este filtro."}</p>
        </div>
      ) : (
        <ul className={`${TARJETA} divide-y divide-borde overflow-hidden`}>
          {visibles.map((r) => (
            <Fila key={r.id} r={r} revisa={revisa} borrar={borrar} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Fila({ r, revisa, borrar }: { r: ResumenRendicion; revisa: boolean; borrar: (id: string) => Promise<Resultado> }) {
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const saldo = saldoRendicion(r.totalGastos, r.montoAsignado);
  const puedeBorrar = revisa || (r.esMia && esEditable(r.estado));
  const fecha = r.pagadaEn ?? r.revisadaEn ?? r.enviadaEn ?? r.creadoEn;
  const queFecha = r.pagadaEn ? (r.fondoId ? "Cerrada" : "Pagada") : r.revisadaEn ? "Revisada" : r.enviadaEn ? "Enviada" : "Creada";

  function eliminar() {
    if (!confirm(`¿Borrar «${r.tituloRendicion}» con sus ${r.cantidadGastos} comprobantes? No se puede deshacer.`)) return;
    iniciar(async () => {
      const res = await borrar(r.id);
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  return (
    <li className={`group relative transition hover:bg-tinta/[0.02] ${pendiente ? "opacity-50" : ""}`}>
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: ESTILO_ESTADO_RENDICION[r.estado].barra }} />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3.5 pl-5 pr-3">
        <Link href={`/rendir-gastos/${r.id}`} className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-0">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-naranjo/10 text-naranjo">
            <IconReceipt2 size={20} stroke={1.75} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-tinta group-hover:text-naranjo">{r.tituloRendicion}</span>
            <span className="block truncate text-xs text-gris">
              {r.nombreQuienRinde}
              {" · "}{r.cantidadGastos} {r.cantidadGastos === 1 ? "comprobante" : "comprobantes"} · {queFecha} {fechaCorta(fecha)}
            </span>
            {r.estado === "rechazada" && r.motivoRechazo && (
              <span className="mt-0.5 block truncate text-xs text-rose-600">Motivo: {r.motivoRechazo}</span>
            )}
          </span>
        </Link>

        <div className="flex items-center gap-5 pl-[3.25rem] sm:pl-0">
          <div className="text-right">
            <p className="font-condensed text-lg font-bold tabular-nums text-tinta">{money(r.totalGastos)}</p>
            {r.montoAsignado > 0 && !r.fondoId && (
              <p className={`text-[11px] tabular-nums ${saldo > 0 ? "text-emerald-600" : saldo < 0 ? "text-amber-700" : "text-gris"}`}>
                {saldo > 0 ? `Reembolsar ${money(saldo)}` : saldo < 0 ? `Reintegrar ${money(-saldo)}` : "Cuadra con el fondo"}
              </p>
            )}
          </div>
          <ChipEstadoRendicion estado={r.estado} />
          <div className="flex w-16 items-center justify-end gap-1">
            {puedeBorrar && (
              <button type="button" onClick={eliminar} disabled={pendiente} title="Borrar" className="grid h-8 w-8 place-items-center rounded-lg text-gris-suave opacity-0 transition max-lg:opacity-100 hover:bg-rose-500/10 hover:text-rose-500 focus:opacity-100 group-hover:opacity-100">
                <IconTrash size={16} />
              </button>
            )}
            <Link href={`/rendir-gastos/${r.id}`} aria-label="Abrir" className="text-gris-suave group-hover:text-naranjo">
              <IconChevronRight size={18} />
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}
