"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconFileText } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { Campo, Pesos } from "@/components/flota/Campos";
import { CAMPO } from "@/lib/estilos";
import {
  ETIQUETA_FRECUENCIA,
  ETIQUETA_TIPO_CONTRATO,
  formatearPatente,
  type Frecuencia,
  type TipoContrato,
} from "@/lib/flota-modelo";
import { crearContratoAction } from "@/app/(protegido)/flota/acciones";

type VehiculoMin = { id: string; patente: string; nombre: string };

/** Nuevo contrato (leasing, seguro, arriendo…). Con `vehiculo` queda fijo. */
export default function FormularioContrato({ vehiculos, vehiculo }: { vehiculos?: VehiculoMin[]; vehiculo?: VehiculoMin }) {
  const [abierta, setAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const hoy = new Date().toISOString().slice(0, 10);

  function enviar(fd: FormData) {
    setError(null);
    if (vehiculo) fd.set("vehiculoId", vehiculo.id);
    iniciar(async () => {
      const r = await crearContratoAction(fd);
      if (!r.ok) return setError(r.error);
      setAbierta(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => { setError(null); setAbierta(true); }}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-4 text-xs font-bold uppercase tracking-wide text-tinta transition hover:border-naranjo/50"
      >
        <IconFileText size={16} /> Nuevo contrato
      </button>

      <VentanaModal
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        titulo="Nuevo contrato"
        descripcion={vehiculo ? `${vehiculo.nombre} · ${formatearPatente(vehiculo.patente)}` : "Leasing, seguros, arriendos o GPS. Avisa 30 días antes de que termine."}
        ancho="max-w-3xl"
      >
        <form action={enviar} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {!vehiculo && (
              <Campo etiqueta="Vehículo" obligatorio>
                <select name="vehiculoId" required className={CAMPO} defaultValue="">
                  <option value="" disabled>— Elige un vehículo —</option>
                  {(vehiculos ?? []).map((v) => <option key={v.id} value={v.id}>{formatearPatente(v.patente)} · {v.nombre}</option>)}
                </select>
              </Campo>
            )}
            <Campo etiqueta="Tipo">
              <select name="tipo" defaultValue="seguro" className={CAMPO}>
                {(Object.keys(ETIQUETA_TIPO_CONTRATO) as TipoContrato[]).map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_CONTRATO[t]}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Proveedor" ayuda="Aseguradora, banco…">
              <input name="proveedor" className={CAMPO} placeholder="Ej: HDI Seguros" />
            </Campo>
            <Campo etiqueta="N° de póliza / contrato" ayuda="Opcional">
              <input name="referencia" className={CAMPO} />
            </Campo>
            <Campo etiqueta="Inicio">
              <input name="inicio" type="date" defaultValue={hoy} className={CAMPO} />
            </Campo>
            <Campo etiqueta="Término" ayuda="Vacío = indefinido">
              <input name="fin" type="date" className={CAMPO} />
            </Campo>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Costo inicial" ayuda="Pie, activación">
              <Pesos name="costoInicial" />
            </Campo>
            <Campo etiqueta="Cuota">
              <Pesos name="costoRecurrente" />
            </Campo>
            <Campo etiqueta="Cada">
              <select name="frecuencia" defaultValue="mensual" className={CAMPO}>
                {(Object.keys(ETIQUETA_FRECUENCIA) as Frecuencia[]).map((f) => <option key={f} value={f}>{ETIQUETA_FRECUENCIA[f]}</option>)}
              </select>
            </Campo>
          </div>
          <Campo etiqueta="Notas" ayuda="Opcional">
            <textarea name="notas" rows={2} className={CAMPO} />
          </Campo>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-borde pt-4">
            <button type="button" onClick={() => setAbierta(false)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-tinta">
              Cancelar
            </button>
            <BotonGuardar pendiente={pendiente}>Guardar contrato</BotonGuardar>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}
