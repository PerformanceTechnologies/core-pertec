import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
import { listarTransferencias } from "@/lib/inventario";
import { ETIQUETA_CLASE, type ClaseOperacion } from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";
import { ChipEstado } from "@/app/(protegido)/inventario/page";

export const dynamic = "force-dynamic";

const FILTROS: { clave: string; etiqueta: string }[] = [
  { clave: "", etiqueta: "Todas" },
  { clave: "recepcion", etiqueta: "Recepciones" },
  { clave: "entrega", etiqueta: "Entregas" },
  { clave: "interna", etiqueta: "Internas" },
  { clave: "ajuste", etiqueta: "Ajustes" },
];

export default async function OperacionesPage({ searchParams }: { searchParams: Promise<{ clase?: string }> }) {
  const { clase } = await searchParams;
  const transferencias = await listarTransferencias(clase ? { clase: clase as ClaseOperacion } : {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const on = (clase ?? "") === f.clave;
            return (
              <Link
                key={f.clave}
                href={f.clave ? `/inventario/operaciones?clase=${f.clave}` : "/inventario/operaciones"}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${on ? "bg-azul text-white" : "border border-borde text-gris hover:text-tinta"}`}
              >
                {f.etiqueta}
              </Link>
            );
          })}
        </div>
        <Link href="/inventario/operaciones/nueva" className="inline-flex items-center gap-1.5 rounded-lg bg-azul px-3.5 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave">
          <IconPlus size={16} /> Nueva operación
        </Link>
      </div>

      {transferencias.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center`}>
          <p className="text-sm text-gris">No hay operaciones{clase ? " de este tipo" : ""} todavía.</p>
        </div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-xs font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Contraparte</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {transferencias.map((t) => (
                  <tr key={t.id} className="transition hover:bg-borde/30">
                    <td className="px-4 py-3">
                      <Link href={`/inventario/operaciones/${t.id}`} className="font-mono font-bold text-azul hover:underline">{t.referencia}</Link>
                    </td>
                    <td className="px-4 py-3 text-gris">{ETIQUETA_CLASE[t.clase]}</td>
                    <td className="px-4 py-3 text-gris">{t.contraparte ?? "—"}</td>
                    <td className="px-4 py-3 text-gris">{new Date(t.creadoEn).toLocaleDateString("es-CL")}</td>
                    <td className="px-4 py-3"><ChipEstado estado={t.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
