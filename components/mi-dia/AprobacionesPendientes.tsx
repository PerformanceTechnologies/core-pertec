"use client";

import Link from "next/link";
import { useState } from "react";
import { IconArrowRight, IconChecklist, IconShoppingCart } from "@tabler/icons-react";
import { SOMBRA_CALIDA } from "@/lib/estilos";
import type { PendientesDeCompras, TarjetaAprobacion } from "@/lib/fin/oc-resumen";
import ResumenConAcciones from "@/components/fin/ResumenConAcciones";
import VentanaModal from "@/components/inventario/VentanaModal";
import { DialogosFin } from "@/components/fin/dialogos";

// Las aprobaciones de compras que esperan a esta persona, en Mi Día. Cada tarjeta abre en un popup el resumen completo de la
// OC, con los botones para decidir ahí mismo. Los permisos son solo para mostrar los botones: cada acción los exige en el servidor.

const cuando = (iso: string | null) => {
  if (!iso) return null;
  const dias = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return dias <= 0 ? "desde hoy" : dias === 1 ? "desde ayer" : `hace ${dias} días`;
};

function Tarjeta({ t, tono, alAbrir }: { t: TarjetaAprobacion; tono: "naranjo" | "rojo"; alAbrir: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={alAbrir}
        className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-lg border border-borde bg-superficie py-3 pl-4 pr-3 text-left transition hover:border-naranjo/40 ${SOMBRA_CALIDA}`}
      >
        <span className={`absolute inset-y-0 left-0 w-[3px] ${tono === "rojo" ? "bg-rose-500" : "bg-naranjo"}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-tinta">{t.titulo}</p>
          <p className="mt-0.5 truncate text-xs text-tinta/50">
            {t.codigo}{t.ocNumero ? ` · ${t.ocNumero}` : ""} · {t.proveedor ?? "Sin proveedor"} · pide {t.solicitante}{cuando(t.desde) ? ` · ${cuando(t.desde)}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-tinta">{t.total}</span>
        <IconArrowRight size={15} className="shrink-0 text-tinta/25 transition group-hover:translate-x-0.5 group-hover:text-naranjo" />
      </button>
    </li>
  );
}

function Grupo({ titulo, tarjetas, tono, alAbrir }: { titulo: string; tarjetas: TarjetaAprobacion[]; tono: "naranjo" | "rojo"; alAbrir: (t: TarjetaAprobacion) => void }) {
  if (tarjetas.length === 0) return null;
  return (
    <div>
      <p className={`mb-2 text-[11px] font-bold uppercase tracking-[0.12em] ${tono === "rojo" ? "text-rose-600" : "text-naranjo"}`}>{titulo} · {tarjetas.length}</p>
      <ul className="flex flex-col gap-2">{tarjetas.map((t) => <Tarjeta key={t.id} t={t} tono={tono} alAbrir={() => alAbrir(t)} />)}</ul>
    </div>
  );
}

export default function AprobacionesPendientes({ pendientes }: { pendientes: PendientesDeCompras }) {
  const [abierta, setAbierta] = useState<TarjetaAprobacion | null>(null);
  const total = pendientes.porAprobar.length + pendientes.porVisar.length + pendientes.devueltas.length;
  // Una tarjeta del popup que ya se resolvió (aprobada, devuelta…) deja de estar aquí al refrescar la página.
  const cerrar = () => setAbierta(null);
  return (
    <section className="mt-10">
      <DialogosFin />
      <div className="flex items-center gap-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tinta/50">Aprobaciones de compras</h2>
        <span className="h-px flex-1 bg-borde" />
        <Link href="/finanzas/compras" className="inline-flex items-center gap-1 text-[11px] font-semibold text-tinta/50 transition hover:text-naranjo">
          <IconShoppingCart size={14} /> Ver compras
        </Link>
      </div>
      <p className="mt-4 text-sm text-tinta/70">
        <IconChecklist size={15} className="mr-1 inline text-naranjo" />
        Tienes <strong className="text-tinta">{total}</strong> {total === 1 ? "solicitud" : "solicitudes"} de compra en {pendientes.empresa} que {total === 1 ? "espera" : "esperan"} algo de ti. Haz clic en una para ver la OC completa y decidir.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Grupo titulo="Por aprobar" tarjetas={pendientes.porAprobar} tono="naranjo" alAbrir={setAbierta} />
          <Grupo titulo="Por visar" tarjetas={pendientes.porVisar} tono="naranjo" alAbrir={setAbierta} />
        </div>
        <div className="flex flex-col gap-6">
          <Grupo titulo="Te las devolvieron" tarjetas={pendientes.devueltas} tono="rojo" alAbrir={setAbierta} />
        </div>
      </div>

      <VentanaModal abierta={abierta !== null} alCerrar={cerrar} titulo={abierta ? `Solicitud ${abierta.codigo}` : "Solicitud"} ancho="max-w-3xl" variante="hoja">
        {abierta && (
          abierta.paso === "Devuelta: corregir y reenviar" ? (
            <div className="space-y-3">
              <ResumenConAcciones id={abierta.id} codigo={abierta.codigo} paso={abierta.paso} ocNumero={abierta.ocNumero} r={abierta.resumen} puedeAprobar={false} puedeVisar={false} cerrar={cerrar} />
              <Link href={`/finanzas/compras/${abierta.id}/editar`} className="inline-flex w-full items-center justify-center rounded-lg bg-naranjo px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 sm:w-auto">Corregir la solicitud</Link>
            </div>
          ) : (
            <ResumenConAcciones id={abierta.id} codigo={abierta.codigo} paso={abierta.paso} ocNumero={abierta.ocNumero} r={abierta.resumen} puedeAprobar={pendientes.puedeAprobar} puedeVisar={pendientes.puedeVisar} cerrar={cerrar} />
          )
        )}
      </VentanaModal>
    </section>
  );
}
