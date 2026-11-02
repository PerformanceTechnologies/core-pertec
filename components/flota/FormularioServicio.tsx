"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconGasStation, IconTool } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { Campo, Pesos, TarjetaAccion } from "@/components/flota/Campos";
import { CAMPO } from "@/lib/estilos";
import {
  ETIQUETA_ESTADO_SERVICIO,
  ETIQUETA_TIPO_SERVICIO,
  formatearPatente,
  type EstadoServicio,
  type TipoServicio,
} from "@/lib/flota-modelo";
import { crearServicioAction } from "@/app/(protegido)/flota/acciones";

type VehiculoMin = { id: string; patente: string; nombre: string };

const AYUDA: Record<TipoServicio, string> = {
  mantencion: "Cambio de aceite, filtros, pauta",
  reparacion: "Algo que falló",
  neumaticos: "Cambio o reparación",
  combustible: "Carga de combustible",
  lavado: "Lavado o limpieza",
  revision: "Planta de revisión técnica",
  otro: "Cualquier otro gasto",
};

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
  const [abierta, setAbierta] = useState(false);
  const [tipo, setTipo] = useState<TipoServicio>(tipoInicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const hoy = new Date().toISOString().slice(0, 10);

  function abrir() {
    setError(null);
    setTipo(tipoInicial);
    setAbierta(true);
  }

  function enviar(fd: FormData) {
    setError(null);
    if (vehiculo) fd.set("vehiculoId", vehiculo.id);
    fd.set("tipo", tipo);
    iniciar(async () => {
      const r = await crearServicioAction(fd);
      if (!r.ok) return setError(r.error);
      setAbierta(false);
      router.refresh();
    });
  }

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
        descripcion={vehiculo ? `${vehiculo.nombre} · ${formatearPatente(vehiculo.patente)}` : "Mantenciones, reparaciones, combustible y otros gastos del vehículo."}
        ancho="max-w-3xl"
      >
        <form action={enviar} className="space-y-5">
          {!vehiculo && (
            <Campo etiqueta="Vehículo" obligatorio>
              <select name="vehiculoId" required className={CAMPO} defaultValue="">
                <option value="" disabled>— Elige un vehículo —</option>
                {(vehiculos ?? []).map((v) => <option key={v.id} value={v.id}>{formatearPatente(v.patente)} · {v.nombre}</option>)}
              </select>
            </Campo>
          )}

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-gris">¿Qué se hizo?</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(ETIQUETA_TIPO_SERVICIO) as TipoServicio[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`rounded-xl border p-2.5 text-left transition ${tipo === t ? "border-naranjo bg-naranjo/[0.06] ring-2 ring-naranjo/15" : "border-borde hover:border-naranjo/40"}`}
                >
                  <span className="block text-sm font-bold text-tinta">{ETIQUETA_TIPO_SERVICIO[t]}</span>
                  <span className="block text-[11px] leading-snug text-gris">{AYUDA[t]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Fecha">
              <input name="fecha" type="date" defaultValue={hoy} className={CAMPO} />
            </Campo>
            <Campo etiqueta="Costo">
              <Pesos name="costo" />
            </Campo>
            <Campo etiqueta="Odómetro" ayuda="Opcional">
              <input name="odometro" type="number" min="0" step="0.1" className={CAMPO} placeholder="km u horas" />
            </Campo>
            <Campo etiqueta="Proveedor / taller" ayuda="Opcional">
              <input name="proveedor" className={CAMPO} placeholder="Ej: Taller Calama" />
            </Campo>
            <Campo etiqueta="Estado">
              <select name="estado" defaultValue="hecho" className={CAMPO}>
                {(Object.keys(ETIQUETA_ESTADO_SERVICIO) as EstadoServicio[]).filter((e) => e !== "cancelado").map((e) => (
                  <option key={e} value={e}>{ETIQUETA_ESTADO_SERVICIO[e]}</option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo etiqueta="Detalle" ayuda="Opcional">
            <textarea name="descripcion" rows={2} className={CAMPO} placeholder="Ej: pauta 20.000 km, cambio de pastillas…" />
          </Campo>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-borde pt-4">
            <button type="button" onClick={() => setAbierta(false)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
              Cancelar
            </button>
            <BotonGuardar pendiente={pendiente}>Guardar servicio</BotonGuardar>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}
