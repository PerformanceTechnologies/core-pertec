import Link from "next/link";
import { IconCar, IconChevronRight, IconSearch, IconSteeringWheel } from "@tabler/icons-react";
import IntroSeccion from "@/components/inventario/IntroSeccion";
import FormularioVehiculo from "@/components/flota/FormularioVehiculo";
import { ChipEstado, IconoVehiculo, Patente } from "@/components/flota/Visual";
import { listarDocumentos, listarMarcas, listarModelos, listarTiposDocumento, listarVehiculos } from "@/lib/flota";
import {
  ETIQUETA_ESTADO,
  armarDocumentos,
  avanceDocumentos,
  esEstadoVehiculo,
  formatearNumero,
  nombreVehiculo,
  type EstadoVehiculo,
} from "@/lib/flota-modelo";
import { CAMPO, TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

const FILTROS: (EstadoVehiculo | "")[] = ["", "disponible", "asignado", "en_taller", "fuera_servicio", "baja"];

export default async function VehiculosPage({ searchParams }: { searchParams: Promise<{ estado?: string; q?: string }> }) {
  const { estado, q } = await searchParams;
  const [todos, marcas, modelos, tipos, documentos] = await Promise.all([listarVehiculos(), listarMarcas(), listarModelos(), listarTiposDocumento(), listarDocumentos()]);
  const filtro = esEstadoVehiculo(estado) ? estado : "";
  const texto = (q ?? "").trim().toLowerCase();
  const vehiculos = todos
    .filter((v) => (filtro ? v.estado === filtro : v.estado !== "baja"))
    .filter((v) => !texto || [v.patente, v.marca, v.modelo, v.conductor, v.faena].some((x) => x?.toLowerCase().includes(texto)));
  const url = (e: string) => {
    const p = new URLSearchParams();
    if (e) p.set("estado", e);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/flota/vehiculos?${s}` : "/flota/vehiculos";
  };

  return (
    <div className="space-y-4">
      <IntroSeccion
        Icono={IconCar}
        tono="bg-naranjo/12 text-naranjo"
        titulo="Vehículos"
        bajada="Cada vehículo con su conductor, odómetro y documentos. Toca uno para ver su ficha completa."
      >
        <div className="flex flex-wrap items-center gap-2">
          <FormularioVehiculo marcas={marcas} modelos={modelos} />
          <span className="text-sm text-gris">{todos.filter((v) => v.estado !== "baja").length} en servicio</span>
        </div>
      </IntroSeccion>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((e) => (
            <Link
              key={e}
              href={url(e)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${filtro === e ? "border-tinta bg-tinta text-superficie" : "border-borde bg-superficie text-gris hover:border-naranjo/50 hover:text-tinta"}`}
            >
              {e ? ETIQUETA_ESTADO[e] : "En servicio"} <span className="opacity-60">{e ? todos.filter((v) => v.estado === e).length : ""}</span>
            </Link>
          ))}
        </div>
        <form className="relative ml-auto w-full sm:w-72">
          {filtro && <input type="hidden" name="estado" value={filtro} />}
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris" />
          <input name="q" defaultValue={q ?? ""} placeholder="Patente, modelo, conductor…" className={`${CAMPO} pl-9`} />
        </form>
      </div>

      {vehiculos.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center text-sm text-gris`}>
          {todos.length === 0 ? "Todavía no hay vehículos. Crea el primero con «Nuevo vehículo»." : "Ningún vehículo coincide con el filtro."}
        </div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Vehículo</th>
                  <th className="px-4 py-3">Conductor</th>
                  <th className="px-4 py-3 text-right">Odómetro</th>
                  <th className="px-4 py-3">Documentos</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {vehiculos.map((v) => {
                  // Avance de la documentación y si algo está vencido; el detalle está en la ficha.
                  const secs = armarDocumentos(tipos, documentos.filter((d) => d.vehiculoId === v.id));
                  const filas = [...secs.base, ...secs.acreditacion];
                  const { listos, total } = avanceDocumentos(filas);
                  const vencidos = filas.filter((f) => f.estado === "vencido").length;
                  const porVencer = filas.filter((f) => f.estado === "por_vencer").length;
                  return (
                    <tr key={v.id} className="group transition hover:bg-tinta/[0.02]">
                      <td className="px-4 py-3">
                        <Link href={`/flota/vehiculos/${v.id}`} className="flex items-center gap-3">
                          <IconoVehiculo categoria={v.categoria} estado={v.estado} />
                          <span className="min-w-0">
                            <Patente patente={v.patente} chica />
                            <span className="mt-0.5 block truncate font-semibold text-tinta group-hover:text-naranjo">{nombreVehiculo(v)}{v.anio ? ` · ${v.anio}` : ""}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gris">
                        {v.conductor ? <span className="inline-flex items-center gap-1.5 text-tinta"><IconSteeringWheel size={14} className="text-gris" /> {v.conductor}</span> : "—"}
                        {v.faena && <span className="block text-xs">{v.faena}</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-tinta">{v.odometro !== null ? `${formatearNumero(v.odometro)} ${v.unidadOdometro}` : "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-tinta/[0.06]">
                            <div className={`h-full rounded-full ${listos === total ? "bg-emerald-500" : "bg-naranjo"}`} style={{ width: `${total ? (listos / total) * 100 : 0}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-gris">{listos}/{total}</span>
                        </div>
                        {(vencidos > 0 || porVencer > 0) && (
                          <span className={`mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold ${vencidos ? "bg-rose-500/12 text-rose-700" : "bg-amber-500/12 text-amber-700"}`}>
                            {vencidos ? `${vencidos} vencido${vencidos > 1 ? "s" : ""}` : `${porVencer} por vencer`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3"><ChipEstado estado={v.estado} /></td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/flota/vehiculos/${v.id}`} className="text-gris-suave group-hover:text-naranjo" aria-label="Ver ficha"><IconChevronRight size={18} /></Link>
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

