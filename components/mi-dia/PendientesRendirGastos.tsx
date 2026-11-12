"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconLoader2, IconReceipt2 } from "@tabler/icons-react";
import { SOMBRA_CALIDA } from "@/lib/estilos";
import { cambiarEmpresaAction } from "@/app/(protegido)/cambiar-empresa";
import type { PendientesRG } from "@/lib/rendidor/pendientes";

/** Lo mismo sirve para cualquier módulo: la misma forma de datos (empresa, items con cantidad y enlace). */

/**
 * Lo pendiente de la persona en Rendir Gastos, por empresa. Cada línea abre la bandeja que corresponde; si es de otra
 * empresa que la activa, primero cambia a esa empresa (Rendir Gastos es independiente por empresa).
 */
export default function PendientesRendirGastos({ pendientes, titulo = "Pendiente en Rendir Gastos" }: { pendientes: PendientesRG[]; titulo?: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const total = pendientes.reduce((s, p) => s + p.items.reduce((a, i) => a + i.cantidad, 0), 0);

  const abrir = (p: PendientesRG, href: string, clave: string) => {
    setAbriendo(`${p.empresaSlug}:${clave}`);
    iniciar(async () => {
      if (!p.esActiva) await cambiarEmpresaAction(p.empresaSlug);
      router.push(href);
      router.refresh();
    });
  };

  return (
    <section className="mt-10">
      <div className="flex items-center gap-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tinta/50">{titulo}</h2>
        <span className="h-px flex-1 bg-borde" />
      </div>
      <p className="mt-4 text-sm text-tinta/70">
        <IconReceipt2 size={15} className="mr-1 inline text-naranjo" />
        Tienes <strong className="text-tinta">{total}</strong> {total === 1 ? "cosa pendiente" : "cosas pendientes"}
        {pendientes.length > 1 ? ` en ${pendientes.length} empresas` : ` en ${pendientes[0]?.empresa}`}.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {pendientes.map((p) => (
          <div key={p.empresaSlug} className={`rounded-lg border border-borde bg-superficie p-4 ${SOMBRA_CALIDA}`}>
            <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-naranjo">
              {p.empresa}
              {!p.esActiva && <span className="rounded bg-tinta/[0.06] px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal text-gris">otra empresa</span>}
            </p>
            <ul className="flex flex-col divide-y divide-borde">
              {p.items.map((i) => (
                <li key={i.clave}>
                  <button type="button" disabled={pendiente} onClick={() => abrir(p, i.href, i.clave)} className="group flex w-full items-center gap-3 py-2 text-left">
                    <span className="grid h-7 min-w-7 place-items-center rounded-md bg-naranjo/10 px-1.5 text-sm font-bold tabular-nums text-naranjo">{i.etiqueta ?? i.cantidad}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-tinta group-hover:text-naranjo">{i.texto}</span>
                    {abriendo === `${p.empresaSlug}:${i.clave}` ? <IconLoader2 size={15} className="animate-spin text-gris" /> : <IconArrowRight size={15} className="text-tinta/25 transition group-hover:translate-x-0.5 group-hover:text-naranjo" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
