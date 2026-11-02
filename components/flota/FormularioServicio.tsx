"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconBucketDroplet,
  IconCalendarCheck,
  IconCircleCheck,
  IconClipboardCheck,
  IconDots,
  IconGasStation,
  IconLoader,
  IconTool,
  IconTools,
  IconWheel,
  type Icon,
} from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { Campo, Seccion, TarjetaAccion } from "@/components/flota/Campos";
import { Patente } from "@/components/flota/Visual";
import BuscadorVehiculo from "@/components/flota/BuscadorVehiculo";
import { CAMPO } from "@/lib/estilos";
import {
  ETIQUETA_ESTADO_SERVICIO,
  ETIQUETA_TIPO_SERVICIO,
  formatearMonto,
  type EstadoServicio,
  type TipoServicio,
} from "@/lib/flota-modelo";
import { crearServicioAction } from "@/app/(protegido)/flota/acciones";

type VehiculoMin = { id: string; patente: string; nombre: string };

const TIPOS: Record<TipoServicio, { ayuda: string; Icono: Icon; tono: string }> = {
  mantencion: { ayuda: "Aceite, filtros, pauta", Icono: IconTool, tono: "bg-amber-500/10 text-amber-600" },
  reparacion: { ayuda: "Algo que falló", Icono: IconTools, tono: "bg-rose-500/10 text-rose-600" },
  neumaticos: { ayuda: "Cambio o reparación", Icono: IconWheel, tono: "bg-slate-500/10 text-slate-600" },
  combustible: { ayuda: "Carga de combustible", Icono: IconGasStation, tono: "bg-sky-500/10 text-sky-600" },
  lavado: { ayuda: "Lavado o limpieza", Icono: IconBucketDroplet, tono: "bg-cyan-500/10 text-cyan-600" },
  revision: { ayuda: "Planta de revisión", Icono: IconClipboardCheck, tono: "bg-emerald-500/10 text-emerald-600" },
  otro: { ayuda: "Cualquier otro gasto", Icono: IconDots, tono: "bg-tinta/[0.06] text-gris" },
};

const ESTADOS: { e: EstadoServicio; ayuda: string; Icono: Icon }[] = [
  { e: "hecho", ayuda: "Ya se hizo y se pagó", Icono: IconCircleCheck },
  { e: "programado", ayuda: "Queda agendado", Icono: IconCalendarCheck },
  { e: "en_curso", ayuda: "Está en el taller", Icono: IconLoader },
];

/** Registrar un servicio. Con `vehiculo` queda fijo; si no, se elige de la lista. */
export default function FormularioServicio({
  vehiculos,
  vehiculo,
  tipoInicial = "mantencion",
  comoTarjeta = false,
}: {
  vehiculos?: VehiculoMin[];
  vehiculo?: VehiculoMin;
  tipoInicial?: TipoServicio;
  comoTarjeta?: boolean;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [abierta, setAbierta] = useState(false);
  const [vehiculoId, setVehiculoId] = useState(vehiculo?.id ?? "");
  const [tipo, setTipo] = useState<TipoServicio>(tipoInicial);
  const [estado, setEstado] = useState<EstadoServicio>("hecho");
  const [costo, setCosto] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  const lista = vehiculos ?? [];
  const elegido = vehiculo ?? lista.find((v) => v.id === vehiculoId);

  function abrir() {
    setError(null);
    setVehiculoId(vehiculo?.id ?? (lista.length === 1 ? lista[0].id : ""));
    setTipo(tipoInicial);
    setEstado("hecho");
    setCosto("");
    setFecha(hoy);
    setAbierta(true);
  }

  function enviar(fd: FormData) {
    setError(null);
    if (!elegido) return setError("Elige el vehículo.");
    fd.set("vehiculoId", elegido.id);
    fd.set("tipo", tipo);
    fd.set("estado", estado);
    iniciar(async () => {
      const r = await crearServicioAction(fd);
      if (!r.ok) return setError(r.error);
      setAbierta(false);
      router.refresh();
    });
  }

  const T = TIPOS[tipo];

  return (
    <>
      {comoTarjeta ? (
        tipoInicial === "combustible" ? (
          <TarjetaAccion titulo="Combustible" detalle="Registrar una carga" Icono={IconGasStation} tono="bg-sky-500/10 text-sky-600" onClick={abrir} />
        ) : (
          <TarjetaAccion titulo="Servicio" detalle="Mantención o reparación" Icono={IconTool} tono="bg-amber-500/10 text-amber-600" onClick={abrir} />
        )
      ) : (
        <button
          onClick={abrir}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-naranjo px-4 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-naranjo-suave"
        >
          <IconTool size={16} /> Registrar servicio
        </button>
      )}

      <VentanaModal
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        titulo="Registrar servicio"
        descripcion="Mantenciones, reparaciones, combustible y otros gastos. Suman al costo del vehículo."
        ancho="max-w-4xl"
      >
        <form action={enviar} className="grid gap-6 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          {/* Resumen en vivo de lo que se va a guardar. */}
          <aside className="lg:sticky lg:top-0 lg:self-start">
            <div className="banda-contraste space-y-4 rounded-2xl p-5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">Resumen</span>
              <div>
                {elegido ? (
                  <>
                    <Patente patente={elegido.patente} />
                    <p className="texto-banda-65 mt-1.5 truncate text-xs">{elegido.nombre}</p>
                  </>
                ) : (
                  <p className="texto-banda-45 text-sm">Sin vehículo elegido</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${T.tono}`}>
                  <T.Icono size={20} stroke={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="texto-banda text-sm font-bold">{ETIQUETA_TIPO_SERVICIO[tipo]}</p>
                  <p className="texto-banda-65 text-xs">{ETIQUETA_ESTADO_SERVICIO[estado]} · {fecha ? new Date(fecha + "T00:00:00").toLocaleDateString("es-CL") : "sin fecha"}</p>
                </div>
              </div>
              <div className="borde-banda border-t pt-3">
                <p className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">Costo</p>
                <p className="texto-banda font-condensed text-3xl font-bold tabular-nums">{formatearMonto(Number(costo) || 0)}</p>
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            {!vehiculo && (
              <Seccion n={1} titulo="¿A qué vehículo?">
                <BuscadorVehiculo vehiculos={lista} elegido={elegido} alElegir={setVehiculoId} />
              </Seccion>
            )}

            <Seccion n={vehiculo ? 1 : 2} titulo="¿Qué se hizo?">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(TIPOS) as TipoServicio[]).map((t) => {
                  const { Icono, tono, ayuda } = TIPOS[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTipo(t)}
                      className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition ${
                        tipo === t ? "border-naranjo bg-naranjo/[0.06] ring-2 ring-naranjo/15" : "border-borde hover:border-naranjo/40"
                      }`}
                    >
                      <span className={`grid h-8 w-8 place-items-center rounded-lg ${tono}`}>
                        <Icono size={17} stroke={1.75} />
                      </span>
                      <span>
                        <span className="block text-sm font-bold text-tinta">{ETIQUETA_TIPO_SERVICIO[t]}</span>
                        <span className="block text-[11px] leading-snug text-gris">{ayuda}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Seccion>

            <Seccion n={vehiculo ? 2 : 3} titulo="¿Cuándo y cuánto?">
              <div className="grid gap-2 sm:grid-cols-3">
                {ESTADOS.map(({ e, ayuda, Icono }) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEstado(e)}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                      estado === e ? "border-naranjo bg-naranjo/[0.06] ring-2 ring-naranjo/15" : "border-borde hover:border-naranjo/40"
                    }`}
                  >
                    <Icono size={18} className={estado === e ? "text-naranjo" : "text-gris"} />
                    <span>
                      <span className="block text-sm font-bold text-tinta">{ETIQUETA_ESTADO_SERVICIO[e]}</span>
                      <span className="block text-[11px] text-gris">{ayuda}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo etiqueta={estado === "programado" ? "Fecha agendada" : "Fecha"}>
                  <input name="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
                </Campo>
                <Campo etiqueta={estado === "hecho" ? "Costo" : "Costo estimado"}>
                  <span className="relative block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gris">$</span>
                    <input name="costo" type="number" min="0" step="1" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0" className={`${CAMPO} pl-7`} />
                  </span>
                </Campo>
                <Campo etiqueta="Odómetro" ayuda="Opcional">
                  <input name="odometro" type="number" min="0" step="0.1" className={CAMPO} placeholder="km u horas" />
                </Campo>
              </div>
            </Seccion>

            <Seccion n={vehiculo ? 3 : 4} titulo="Detalle">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                <Campo etiqueta={tipo === "combustible" ? "Estación" : "Proveedor / taller"} ayuda="Opcional">
                  <input name="proveedor" className={CAMPO} placeholder={tipo === "combustible" ? "Ej: Copec Calama" : "Ej: Taller Calama"} />
                </Campo>
                <Campo etiqueta="Qué se hizo" ayuda="Opcional">
                  <input name="descripcion" className={CAMPO} placeholder={tipo === "combustible" ? "Ej: 60 litros diésel" : "Ej: pauta 20.000 km, cambio de pastillas"} />
                </Campo>
              </div>
            </Seccion>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-borde pt-4">
              <button type="button" onClick={() => setAbierta(false)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
                Cancelar
              </button>
              <BotonGuardar pendiente={pendiente}>Guardar servicio</BotonGuardar>
            </div>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}
