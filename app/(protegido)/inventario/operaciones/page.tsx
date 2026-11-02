import Link from "next/link";
import { IconArrowsExchange, IconPlus } from "@tabler/icons-react";
import IntroSeccion, { Pistas } from "@/components/inventario/IntroSeccion";
import { listarTransferencias } from "@/lib/inventario";
import { ETIQUETA_CLASE, type ClaseOperacion } from "@/lib/inventario-modelo";
import { TARJETA } from "@/lib/estilos";
import { ChipEstado, IconoClase } from "@/components/inventario/Visual";

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
      <IntroSeccion
        Icono={IconArrowsExchange}
        tono="bg-violet-500/10 text-violet-600"
        titulo="Operaciones"
        bajada="Todo lo que entra, sale o se mueve entre bodegas. Cada operación es un documento con su número."
        accion={{ href: "/inventario/operaciones/nueva", texto: "Nueva operación", Icono: IconPlus }}
      >
        <Pistas items={["Crea la operación", "Revisa los productos", "Valida para mover el stock"]} />
      </IntroSeccion>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const on = (clase ?? "") === f.clave;
            return (
              <Link
                key={f.clave}
                href={f.clave ? `/inventario/operaciones?clase=${f.clave}` : "/inventario/operaciones"}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${on ? "border-tinta bg-tinta text-superficie" : "border-borde bg-superficie text-gris hover:border-naranjo/50 hover:text-tinta"}`}
              >
                {f.etiqueta}
              </Link>
            );
          })}
        </div>
      </div>

      {transferencias.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center`}>
          <p className="text-sm text-gris">No hay operaciones{clase ? " de este tipo" : ""} todavía.</p>
          <Link href={`/inventario/operaciones/nueva${clase ? `?clase=${clase}` : ""}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-naranjo hover:underline">
            <IconPlus size={16} /> Crear la primera
          </Link>
        </div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3">Contraparte</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {transferencias.map((t) => (
                  <tr key={t.id} className="transition hover:bg-tinta/[0.02]">
                    <td className="px-4 py-3">
                      <Link href={`/inventario/operaciones/${t.id}`} className="flex items-center gap-3">
                        <IconoClase clase={t.clase} chico />
                        <span>
                          <span className="block font-mono font-bold text-tinta hover:text-naranjo">{t.referencia}</span>
                          <span className="block text-xs text-gris">{ETIQUETA_CLASE[t.clase]}</span>
                        </span>
                      </Link>
                    </td>
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
