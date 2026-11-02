"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconBuildingBank,
  IconDots,
  IconFileText,
  IconKey,
  IconMapPin,
  IconSearch,
  IconShieldCheck,
  type Icon,
} from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { Campo, Seccion, TarjetaAccion } from "@/components/flota/Campos";
import { Patente } from "@/components/flota/Visual";
import { CAMPO } from "@/lib/estilos";
import {
  ETIQUETA_FRECUENCIA,
  ETIQUETA_TIPO_CONTRATO,
  formatearMonto,
  type Frecuencia,
  type TipoContrato,
} from "@/lib/flota-modelo";
import { crearContratoAction } from "@/app/(protegido)/flota/acciones";

type VehiculoMin = { id: string; patente: string; nombre: string };

const TIPOS: Record<TipoContrato, { ayuda: string; Icono: Icon; proveedor: string }> = {
  seguro: { ayuda: "Póliza del vehículo", Icono: IconShieldCheck, proveedor: "Aseguradora" },
  leasing: { ayuda: "Cuotas al banco", Icono: IconBuildingBank, proveedor: "Banco / financiera" },
  arriendo: { ayuda: "Vehículo arrendado", Icono: IconKey, proveedor: "Arrendadora" },
  gps: { ayuda: "GPS o telemetría", Icono: IconMapPin, proveedor: "Proveedor GPS" },
  otro: { ayuda: "Otro contrato", Icono: IconDots, proveedor: "Proveedor" },
};

const AYUDA_FRECUENCIA: Record<Frecuencia, string> = { mensual: "Cada mes", anual: "Una vez al año", unico: "Se paga una sola vez" };

/** Nuevo contrato (leasing, seguro, arriendo…). Con `vehiculo` queda fijo. */
export default function FormularioContrato({
  vehiculos,
  vehiculo,
  comoTarjeta = false,
}: {
  vehiculos?: VehiculoMin[];
  vehiculo?: VehiculoMin;
  comoTarjeta?: boolean;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [abierta, setAbierta] = useState(false);
  const [vehiculoId, setVehiculoId] = useState(vehiculo?.id ?? "");
  const [buscar, setBuscar] = useState("");
  const [tipo, setTipo] = useState<TipoContrato>("seguro");
  const [frecuencia, setFrecuencia] = useState<Frecuencia>("mensual");
  const [cuota, setCuota] = useState("");
  const [inicio, setInicio] = useState(hoy);
  const [fin, setFin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  const lista = vehiculos ?? [];
  const elegido = vehiculo ?? lista.find((v) => v.id === vehiculoId);
  const filtro = buscar.trim().toLowerCase().replace(/[\s·.-]/g, "");
  const visibles = filtro ? lista.filter((v) => `${v.patente}${v.nombre}`.toLowerCase().replace(/[\s·.-]/g, "").includes(filtro)) : lista;
  const fechaCl = (f: string) => new Date(f + "T00:00:00").toLocaleDateString("es-CL");

  function abrir() {
    setError(null);
    setVehiculoId(vehiculo?.id ?? (lista.length === 1 ? lista[0].id : ""));
    setBuscar("");
    setTipo("seguro");
    setFrecuencia("mensual");
    setCuota("");
    setInicio(hoy);
    setFin("");
    setAbierta(true);
  }

  function enviar(fd: FormData) {
    setError(null);
    if (!elegido) return setError("Elige el vehículo.");
    if (fin && fin < inicio) return setError("El término no puede ser antes del inicio.");
    fd.set("vehiculoId", elegido.id);
    fd.set("tipo", tipo);
    fd.set("frecuencia", frecuencia);
    iniciar(async () => {
      const r = await crearContratoAction(fd);
      if (!r.ok) return setError(r.error);
      setAbierta(false);
      router.refresh();
    });
  }

  const T = TIPOS[tipo];

  return (
    <>
      {comoTarjeta ? (
        <TarjetaAccion titulo="Contrato" detalle="Seguro, leasing o arriendo" Icono={IconFileText} tono="bg-indigo-500/10 text-indigo-600" onClick={abrir} />
      ) : (
        <button
          onClick={abrir}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-4 text-xs font-bold uppercase tracking-wide text-tinta transition hover:border-naranjo/50"
        >
          <IconFileText size={16} /> Nuevo contrato
        </button>
      )}

      <VentanaModal
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        titulo="Nuevo contrato"
        descripcion="Leasing, seguros, arriendos o GPS. El tablero avisa 30 días antes de que termine."
        ancho="max-w-4xl"
      >
        <form action={enviar} className="grid gap-6 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
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
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-400">
                  <T.Icono size={20} stroke={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="texto-banda text-sm font-bold">{ETIQUETA_TIPO_CONTRATO[tipo]}</p>
                  <p className="texto-banda-65 text-xs">{fechaCl(inicio || hoy)} → {fin ? fechaCl(fin) : "indefinido"}</p>
                </div>
              </div>
              <div className="borde-banda border-t pt-3">
                <p className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">Cuota {ETIQUETA_FRECUENCIA[frecuencia].toLowerCase()}</p>
                <p className="texto-banda font-condensed text-3xl font-bold tabular-nums">{formatearMonto(Number(cuota) || 0)}</p>
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            {!vehiculo && (
              <Seccion n={1} titulo="¿De qué vehículo?">
                {lista.length > 6 && (
                  <div className="relative">
                    <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris" />
                    <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por patente o modelo" className={`${CAMPO} pl-9`} />
                  </div>
                )}
                <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {visibles.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVehiculoId(v.id)}
                      className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                        v.id === vehiculoId ? "border-naranjo bg-naranjo/[0.06] ring-2 ring-naranjo/15" : "border-borde hover:border-naranjo/40"
                      }`}
                    >
                      <Patente patente={v.patente} chica />
                      <span className="min-w-0 truncate text-sm text-tinta">{v.nombre}</span>
                    </button>
                  ))}
                  {visibles.length === 0 && <p className="col-span-full py-3 text-center text-sm text-gris">Ningún vehículo coincide.</p>}
                </div>
              </Seccion>
            )}

            <Seccion n={vehiculo ? 1 : 2} titulo="¿Qué contrato es?">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(Object.keys(TIPOS) as TipoContrato[]).map((t) => {
                  const { Icono, ayuda } = TIPOS[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTipo(t)}
                      className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition ${
                        tipo === t ? "border-naranjo bg-naranjo/[0.06] ring-2 ring-naranjo/15" : "border-borde hover:border-naranjo/40"
                      }`}
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500/10 text-indigo-600">
                        <Icono size={17} stroke={1.75} />
                      </span>
                      <span>
                        <span className="block text-sm font-bold text-tinta">{ETIQUETA_TIPO_CONTRATO[t]}</span>
                        <span className="block text-[11px] leading-snug text-gris">{ayuda}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta={T.proveedor}>
                  <input name="proveedor" className={CAMPO} placeholder={tipo === "seguro" ? "Ej: HDI Seguros" : tipo === "leasing" ? "Ej: Banco de Chile" : ""} />
                </Campo>
                <Campo etiqueta="N° de póliza / contrato" ayuda="Opcional">
                  <input name="referencia" className={CAMPO} />
                </Campo>
              </div>
            </Seccion>

            <Seccion n={vehiculo ? 2 : 3} titulo="Vigencia">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Inicio">
                  <input name="inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={CAMPO} />
                </Campo>
                <Campo etiqueta="Término" ayuda="Vacío = sin fecha de término">
                  <input name="fin" type="date" value={fin} min={inicio} onChange={(e) => setFin(e.target.value)} className={CAMPO} />
                </Campo>
              </div>
            </Seccion>

            <Seccion n={vehiculo ? 3 : 4} titulo="Pagos">
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(AYUDA_FRECUENCIA) as Frecuencia[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFrecuencia(f)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      frecuencia === f ? "border-naranjo bg-naranjo/[0.06] ring-2 ring-naranjo/15" : "border-borde hover:border-naranjo/40"
                    }`}
                  >
                    <span className="block text-sm font-bold text-tinta">{ETIQUETA_FRECUENCIA[f]}</span>
                    <span className="block text-[11px] text-gris">{AYUDA_FRECUENCIA[f]}</span>
                  </button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta={frecuencia === "unico" ? "Monto" : "Cuota"}>
                  <span className="relative block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gris">$</span>
                    <input
                      name={frecuencia === "unico" ? "costoInicial" : "costoRecurrente"}
                      type="number" min="0" step="1" value={cuota} onChange={(e) => setCuota(e.target.value)} placeholder="0" className={`${CAMPO} pl-7`}
                    />
                  </span>
                </Campo>
                {frecuencia !== "unico" && (
                  <Campo etiqueta="Pago inicial" ayuda="Pie o activación, opcional">
                    <span className="relative block">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gris">$</span>
                      <input name="costoInicial" type="number" min="0" step="1" placeholder="0" className={`${CAMPO} pl-7`} />
                    </span>
                  </Campo>
                )}
              </div>
              <Campo etiqueta="Notas" ayuda="Opcional">
                <input name="notas" className={CAMPO} placeholder="Cobertura, deducible, condiciones…" />
              </Campo>
            </Seccion>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-borde pt-4">
              <button type="button" onClick={() => setAbierta(false)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
                Cancelar
              </button>
              <BotonGuardar pendiente={pendiente}>Guardar contrato</BotonGuardar>
            </div>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}
