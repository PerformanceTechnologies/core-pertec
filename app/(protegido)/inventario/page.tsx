import Link from "next/link";
import { IconAlertTriangle, IconArrowRight, IconBox, IconCoin, IconTruckLoading } from "@tabler/icons-react";
import { tablero } from "@/lib/inventario";
import { ETIQUETA_CLASE, ETIQUETA_ESTADO, TONO_ESTADO, formatearMonto, type EstadoTransferencia } from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function TableroInventarioPage() {
  const t = await tablero();

  const kpis = [
    { etiqueta: "Productos activos", valor: String(t.productos), icono: <IconBox size={20} />, href: "/inventario/productos" },
    { etiqueta: "Valor del inventario", valor: formatearMonto(t.valorInventario), icono: <IconCoin size={20} />, href: "/inventario/valorizacion" },
    { etiqueta: "Bajo mínimo", valor: String(t.bajoMinimo), icono: <IconAlertTriangle size={20} />, href: "/inventario/reabastecimiento", alerta: t.bajoMinimo > 0 },
    { etiqueta: "Operaciones pendientes", valor: String(t.transferenciasPendientes), icono: <IconTruckLoading size={20} />, href: "/inventario/operaciones" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.etiqueta} href={k.href} className={`${TARJETA} group p-4 transition hover:border-cian`}>
            <div className="flex items-center justify-between">
              <span className={`grid h-9 w-9 place-items-center rounded-lg ${k.alerta ? "bg-amber-100 text-amber-600" : "bg-azul/10 text-azul"}`}>
                {k.icono}
              </span>
              <IconArrowRight size={16} className="text-gris-suave transition group-hover:translate-x-0.5 group-hover:text-cian" />
            </div>
            <p className="mt-3 text-2xl font-extrabold tabular-nums text-tinta">{k.valor}</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-gris">{k.etiqueta}</p>
          </Link>
        ))}
      </div>

      <section className={`${TARJETA} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-borde px-5 py-3.5">
          <h2 className="text-sm font-bold text-tinta">Últimas operaciones</h2>
          <Link href="/inventario/operaciones" className="text-xs font-semibold text-cian hover:underline">Ver todas</Link>
        </div>
        {t.recientes.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gris">Todavía no hay operaciones. Crea una recepción o entrega desde Operaciones.</p>
        ) : (
          <ul className="divide-y divide-borde">
            {t.recientes.map((r) => (
              <li key={r.id}>
                <Link href={`/inventario/operaciones/${r.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-borde/30">
                  <span className="w-20 shrink-0 font-mono text-sm font-bold text-tinta">{r.referencia}</span>
                  <span className="flex-1 truncate text-sm text-gris">
                    {ETIQUETA_CLASE[r.clase]}
                    {r.contraparte ? ` · ${r.contraparte}` : ""} · {r.nLineas} {r.nLineas === 1 ? "línea" : "líneas"}
                  </span>
                  <ChipEstado estado={r.estado} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ChipEstado({ estado }: { estado: EstadoTransferencia }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${TONO_ESTADO[estado]}`}>
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}
