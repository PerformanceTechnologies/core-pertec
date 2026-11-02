"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconArchive, IconGauge, IconSteeringWheel } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { Campo } from "@/components/flota/Campos";
import { CAMPO } from "@/lib/estilos";
import { ESTADOS_TABLERO, ETIQUETA_ESTADO, formatearNumero, type EstadoVehiculo } from "@/lib/flota-modelo";
import {
  asignarConductorAction,
  cambiarEstadoAction,
  darDeBajaAction,
  registrarLecturaAction,
} from "@/app/(protegido)/flota/acciones";

/** Cambiar el estado desde la ficha: botones segmentados, uno por etapa del tablero. */
export function SelectorEstado({ id, estado }: { id: string; estado: EstadoVehiculo }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  if (estado === "baja") return null;

  function cambiar(nuevo: EstadoVehiculo) {
    if (nuevo === estado) return;
    iniciar(async () => {
      const r = await cambiarEstadoAction(id, nuevo);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  return (
    <div>
      <div className={`inline-flex flex-wrap gap-1 rounded-xl border border-borde bg-superficie p-1 ${pendiente ? "opacity-60" : ""}`}>
        {ESTADOS_TABLERO.map((e) => (
          <button
            key={e}
            type="button"
            disabled={pendiente}
            onClick={() => cambiar(e)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${e === estado ? "bg-tinta text-superficie" : "text-gris hover:bg-tinta/[0.05] hover:text-tinta"}`}
          >
            {ETIQUETA_ESTADO[e]}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export function AsignarConductor({ id, conductor, faena }: { id: string; conductor: string | null; faena: string | null }) {
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  function enviar(fd: FormData) {
    setError(null);
    iniciar(async () => {
      const r = await asignarConductorAction(id, fd);
      if (!r.ok) return setError(r.error);
      setAbierta(false);
      router.refresh();
    });
  }

  return (
    <>
      <button onClick={() => { setError(null); setAbierta(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-sm font-semibold text-azul transition hover:border-cian">
        <IconSteeringWheel size={16} /> {conductor ? "Cambiar conductor" : "Asignar conductor"}
      </button>
      <VentanaModal abierta={abierta} alCerrar={() => setAbierta(false)} titulo={conductor ? "Cambiar conductor" : "Asignar conductor"} descripcion="La asignación anterior se cierra hoy y queda en el historial. Déjalo vacío para liberar el vehículo.">
        <form action={enviar} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Conductor">
              <input name="conductor" defaultValue={conductor ?? ""} className={CAMPO} placeholder="Nombre del conductor" autoFocus />
            </Campo>
            <Campo etiqueta="Faena / ubicación">
              <input name="faena" defaultValue={faena ?? ""} className={CAMPO} placeholder="Ej: Calama" />
            </Campo>
          </div>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAbierta(false)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
              Cancelar
            </button>
            <BotonGuardar pendiente={pendiente}>Guardar</BotonGuardar>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}

export function RegistrarLectura({ id, unidad, ultima }: { id: string; unidad: "km" | "horas"; ultima: number | null }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const hoy = new Date().toISOString().slice(0, 10);

  function enviar(fd: FormData) {
    setError(null);
    iniciar(async () => {
      const r = await registrarLecturaAction(id, fd);
      if (!r.ok) return setError(r.error);
      (document.getElementById(`lectura-${id}`) as HTMLFormElement | null)?.reset();
      router.refresh();
    });
  }

  return (
    <form id={`lectura-${id}`} action={enviar} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-32 flex-1">
          <span className="mb-1 block text-xs font-semibold text-gris">Nueva lectura ({unidad})</span>
          <input name="valor" type="number" min={ultima ?? 0} step="0.1" required className={CAMPO} placeholder={ultima !== null ? `Más de ${formatearNumero(ultima)}` : "0"} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-gris">Fecha</span>
          <input name="fecha" type="date" defaultValue={hoy} className={CAMPO} />
        </label>
        <button type="submit" disabled={pendiente} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-azul px-4 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave disabled:opacity-60">
          <IconGauge size={16} /> {pendiente ? "Guardando…" : "Registrar"}
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </form>
  );
}

export function DarDeBaja({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pendiente}
      onClick={() => {
        if (!confirm("¿Dar de baja este vehículo? Se libera el conductor y deja de avisar vencimientos. El historial se conserva.")) return;
        iniciar(async () => {
          const r = await darDeBajaAction(id);
          if (r.ok) router.refresh();
          else alert(r.error);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
    >
      <IconArchive size={16} /> Dar de baja
    </button>
  );
}
