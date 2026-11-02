import Link from "next/link";
import { IconFileText } from "@tabler/icons-react";
import IntroSeccion from "@/components/inventario/IntroSeccion";
import FormularioContrato from "@/components/flota/FormularioContrato";
import { AccionesContrato } from "@/components/flota/AccionesFila";
import { ChipVencimiento, Patente } from "@/components/flota/Visual";
import { listarContratos, listarVehiculos } from "@/lib/flota";
import { ETIQUETA_FRECUENCIA, ETIQUETA_TIPO_CONTRATO, formatearMonto, nombreVehiculo } from "@/lib/flota-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

const fechaCl = (f: string) => new Date(f + "T00:00:00").toLocaleDateString("es-CL");

export default async function ContratosPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const [todos, vehiculos] = await Promise.all([listarContratos(), listarVehiculos()]);
  const cerrados = ver === "cerrados";
  const contratos = todos.filter((c) => c.cerrado === cerrados);
  const vehiculo = new Map(vehiculos.map((v) => [v.id, v]));
  const enServicio = vehiculos.filter((v) => v.estado !== "baja").map((v) => ({ id: v.id, patente: v.patente, nombre: nombreVehiculo(v) }));
  const mensual = todos
    .filter((c) => !c.cerrado)
    .reduce((s, c) => s + (c.frecuencia === "mensual" ? c.costoRecurrente : c.frecuencia === "anual" ? c.costoRecurrente / 12 : 0), 0);

  return (
    <div className="space-y-4">
      <IntroSeccion
        Icono={IconFileText}
        tono="bg-indigo-500/10 text-indigo-600"
        titulo="Contratos"
        bajada="Leasing, seguros, arriendos y GPS de cada vehículo. El tablero avisa 30 días antes de que terminen."
      >
        <div className="flex flex-wrap items-center gap-3">
          {enServicio.length > 0 && <FormularioContrato vehiculos={enServicio} />}
          <span className="text-sm text-gris">Compromiso mensual: <strong className="text-tinta">{formatearMonto(mensual)}</strong></span>
        </div>
      </IntroSeccion>

      <div className="flex gap-1.5">
        {[{ k: "", t: "Activos" }, { k: "cerrados", t: "Cerrados" }].map((f) => (
          <Link
            key={f.k}
            href={f.k ? `/flota/contratos?ver=${f.k}` : "/flota/contratos"}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${(ver ?? "") === f.k ? "border-tinta bg-tinta text-superficie" : "border-borde bg-superficie text-gris hover:border-naranjo/50 hover:text-tinta"}`}
          >
            {f.t}
          </Link>
        ))}
      </div>

      {contratos.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center text-sm text-gris`}>{cerrados ? "No hay contratos cerrados." : "Sin contratos activos."}</div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Vehículo</th>
                  <th className="px-4 py-3">Contrato</th>
                  <th className="px-4 py-3">Vigencia</th>
                  <th className="px-4 py-3 text-right">Cuota</th>
                  <th className="px-4 py-3">Vence</th>
                  <th className="px-2 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {contratos.map((c) => {
                  const v = vehiculo.get(c.vehiculoId);
                  return (
                    <tr key={c.id} className="transition hover:bg-tinta/[0.02]">
                      <td className="px-4 py-3">
                        {v && (
                          <Link href={`/flota/vehiculos/${v.id}`} className="flex items-center gap-2 hover:text-naranjo">
                            <Patente patente={v.patente} chica />
                            <span className="truncate text-xs text-gris">{nombreVehiculo(v)}</span>
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-tinta">{ETIQUETA_TIPO_CONTRATO[c.tipo]}</span>
                        <span className="block text-xs text-gris">{[c.proveedor, c.referencia].filter(Boolean).join(" · ") || "—"}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gris">{fechaCl(c.inicio)} → {c.fin ? fechaCl(c.fin) : "indefinido"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-tinta">
                        {formatearMonto(c.costoRecurrente)} <span className="text-xs text-gris">{ETIQUETA_FRECUENCIA[c.frecuencia].toLowerCase()}</span>
                      </td>
                      <td className="px-4 py-3">{c.cerrado ? <span className="text-xs text-gris">Cerrado</span> : <ChipVencimiento fecha={c.fin} corto />}</td>
                      <td className="px-2 py-3 text-right"><AccionesContrato id={c.id} vehiculoId={c.vehiculoId} cerrado={c.cerrado} /></td>
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
