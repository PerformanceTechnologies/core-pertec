import Link from "next/link";
import { IconTool } from "@tabler/icons-react";
import IntroSeccion, { Pistas } from "@/components/inventario/IntroSeccion";
import FormularioServicio from "@/components/flota/FormularioServicio";
import { AccionesServicio } from "@/components/flota/AccionesFila";
import { Patente } from "@/components/flota/Visual";
import { listarServicios, listarVehiculos } from "@/lib/flota";
import {
  ETIQUETA_ESTADO_SERVICIO,
  ETIQUETA_TIPO_SERVICIO,
  esTipoServicio,
  formatearMonto,
  nombreVehiculo,
  type TipoServicio,
} from "@/lib/flota-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

const TONO_ESTADO = {
  programado: "bg-sky-500/10 text-sky-700",
  en_curso: "bg-amber-500/12 text-amber-700",
  hecho: "bg-emerald-500/10 text-emerald-700",
  cancelado: "bg-borde/60 text-gris",
} as const;

export default async function ServiciosPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams;
  const [todos, vehiculos] = await Promise.all([listarServicios(), listarVehiculos()]);
  const filtro = esTipoServicio(tipo) ? tipo : "";
  const servicios = filtro ? todos.filter((s) => s.tipo === filtro) : todos;
  const vehiculo = new Map(vehiculos.map((v) => [v.id, v]));
  const enServicio = vehiculos.filter((v) => v.estado !== "baja").map((v) => ({ id: v.id, patente: v.patente, nombre: nombreVehiculo(v) }));
  const total = servicios.filter((s) => s.estado === "hecho").reduce((s, x) => s + x.costo, 0);

  return (
    <div className="space-y-4">
      <IntroSeccion
        Icono={IconTool}
        tono="bg-amber-500/10 text-amber-600"
        titulo="Servicios"
        bajada="Mantenciones, reparaciones, combustible y todo gasto puntual de cada vehículo. Suman al costo de la flota."
      >
        <div className="space-y-3">
          <Pistas items={["Elige el vehículo", "Marca qué se hizo y cuánto costó", "Programados: márcalos hechos al terminar"]} />
          {enServicio.length > 0 && <FormularioServicio vehiculos={enServicio} />}
        </div>
      </IntroSeccion>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["", ...Object.keys(ETIQUETA_TIPO_SERVICIO)] as (TipoServicio | "")[]).map((t) => (
          <Link
            key={t}
            href={t ? `/flota/servicios?tipo=${t}` : "/flota/servicios"}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${filtro === t ? "border-tinta bg-tinta text-superficie" : "border-borde bg-superficie text-gris hover:border-naranjo/50 hover:text-tinta"}`}
          >
            {t ? ETIQUETA_TIPO_SERVICIO[t] : "Todos"}
          </Link>
        ))}
        <span className="ml-auto text-sm text-gris">Total hecho: <strong className="text-tinta">{formatearMonto(total)}</strong></span>
      </div>

      {servicios.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center text-sm text-gris`}>Sin servicios{filtro ? " de este tipo" : ""} todavía.</div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Vehículo</th>
                  <th className="px-4 py-3">Servicio</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                  <th className="px-2 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {servicios.map((s) => {
                  const v = vehiculo.get(s.vehiculoId);
                  return (
                    <tr key={s.id} className="transition hover:bg-tinta/[0.02]">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gris">{new Date(s.fecha + "T00:00:00").toLocaleDateString("es-CL")}</td>
                      <td className="px-4 py-3">
                        {v && (
                          <Link href={`/flota/vehiculos/${v.id}`} className="flex items-center gap-2 hover:text-naranjo">
                            <Patente patente={v.patente} chica />
                            <span className="truncate text-xs text-gris">{nombreVehiculo(v)}</span>
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-tinta">{ETIQUETA_TIPO_SERVICIO[s.tipo]}</span>
                        {(s.descripcion || s.proveedor) && <span className="block text-xs text-gris">{[s.descripcion, s.proveedor].filter(Boolean).join(" · ")}</span>}
                      </td>
                      <td className="px-4 py-3"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${TONO_ESTADO[s.estado]}`}>{ETIQUETA_ESTADO_SERVICIO[s.estado]}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-tinta">{formatearMonto(s.costo)}</td>
                      <td className="px-2 py-3 text-right"><AccionesServicio id={s.id} vehiculoId={s.vehiculoId} estado={s.estado} /></td>
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
