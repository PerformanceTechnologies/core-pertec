"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconArrowBackUp, IconCash, IconCheck, IconPencil, IconSend, IconX } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { Campo } from "@/components/flota/Campos";
import RuedaCarga from "@/components/RuedaCarga";
import { CAMPO } from "@/lib/estilos";
import type { AccionRendicion } from "@/lib/permisos-rendidor";
import { actualizarCabeceraAction, moverRendicionAction } from "@/app/(protegido)/rendir-gastos/acciones";

const BOTON: Record<AccionRendicion, { texto: string; Icono: typeof IconCheck; clase: string }> = {
  enviar: { texto: "Enviar a revisión", Icono: IconSend, clase: "bg-naranjo text-white hover:bg-naranjo-suave" },
  retirar: { texto: "Retirar para corregir", Icono: IconArrowBackUp, clase: "border border-borde bg-superficie text-tinta hover:border-naranjo/50" },
  aprobar: { texto: "Aprobar", Icono: IconCheck, clase: "bg-emerald-600 text-white hover:bg-emerald-700" },
  rechazar: { texto: "Rechazar", Icono: IconX, clase: "border border-rose-300 bg-superficie text-rose-600 hover:bg-rose-50" },
  pagar: { texto: "Marcar como pagada", Icono: IconCash, clase: "bg-emerald-600 text-white hover:bg-emerald-700" },
  reabrir: { texto: "Volver a revisión", Icono: IconArrowBackUp, clase: "border border-borde bg-superficie text-tinta hover:border-naranjo/50" },
};

/**
 * Los botones del ciclo de la rendición. Solo se muestran los que corresponden a quien
 * mira y al estado; el servidor vuelve a validar cada uno.
 */
export default function FlujoRendicion({
  id,
  acciones,
  problemasEnvio,
  saldo,
  nombre,
}: {
  id: string;
  acciones: AccionRendicion[];
  /** Lo que falta para poder enviar (vacío = listo). */
  problemasEnvio: string[];
  saldo: number;
  nombre: string;
}) {
  const [pidiendo, setPidiendo] = useState<"rechazar" | "pagar" | null>(null);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  function correr(accion: AccionRendicion, texto?: string) {
    setError(null);
    iniciar(async () => {
      const r = await moverRendicionAction(id, accion, texto);
      if (!r.ok) return setError(r.error);
      setPidiendo(null);
      setNota("");
      router.refresh();
    });
  }

  if (acciones.length === 0) return null;
  const visibles = acciones.filter((a) => a !== "enviar" || problemasEnvio.length === 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {visibles.map((a) => {
          const b = BOTON[a];
          return (
            <button
              key={a}
              type="button"
              disabled={pendiente}
              onClick={() => (a === "rechazar" || a === "pagar" ? (setNota(""), setError(null), setPidiendo(a)) : correr(a))}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-4 text-xs font-bold uppercase tracking-wide shadow-sm transition disabled:opacity-60 ${b.clase}`}
            >
              {pendiente ? <RuedaCarga /> : <b.Icono size={16} />} {b.texto}
            </button>
          );
        })}
        {acciones.includes("enviar") && problemasEnvio.length > 0 && (
          <p className="texto-banda-65 text-xs">Para enviar: {problemasEnvio.join(" ")}</p>
        )}
      </div>
      {error && !pidiendo && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <VentanaModal
        abierta={pidiendo !== null}
        alCerrar={() => setPidiendo(null)}
        titulo={pidiendo === "rechazar" ? "Rechazar rendición" : "Marcar como pagada"}
        descripcion={
          pidiendo === "rechazar"
            ? `Vuelve a ${nombre} para que la corrija. El motivo le llega en la campana.`
            : saldo > 0
              ? `Se le reembolsan $${Math.round(saldo).toLocaleString("es-CL")} a ${nombre}.`
              : saldo < 0
                ? `${nombre} debe reintegrar $${Math.round(-saldo).toLocaleString("es-CL")} del fondo.`
                : "Lo rendido cuadra exacto con el fondo entregado."
        }
        ancho="max-w-lg"
      >
        <form action={() => { if (pidiendo) correr(pidiendo, nota); }} className="space-y-4">
          <Campo etiqueta={pidiendo === "rechazar" ? "¿Qué hay que corregir?" : "Detalle del pago"} obligatorio={pidiendo === "rechazar"} ayuda={pidiendo === "pagar" ? "Opcional" : undefined}>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              autoFocus
              required={pidiendo === "rechazar"}
              className={CAMPO}
              placeholder={pidiendo === "rechazar" ? "Ej: falta la boleta del peaje del día 12" : "Ej: transferencia del 15/11, Banco de Chile"}
            />
          </Campo>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPidiendo(null)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris hover:text-tinta">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pendiente}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-60 ${pidiendo === "rechazar" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
            >
              {pendiente && <RuedaCarga />}
              {pidiendo === "rechazar" ? "Rechazar" : "Confirmar pago"}
            </button>
          </div>
        </form>
      </VentanaModal>
    </div>
  );
}

/** Cambiar título y fondo mientras la rendición está en manos de quien rinde. */
export function EditarCabecera({ id, titulo, monto }: { id: string; titulo: string; monto: number }) {
  const [abierta, setAbierta] = useState(false);
  const [t, setT] = useState(titulo);
  const [m, setM] = useState(String(monto));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await actualizarCabeceraAction(id, { tituloRendicion: t, montoAsignado: Number(m) || 0 });
      if (!r.ok) return setError(r.error);
      setAbierta(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setT(titulo); setM(String(monto)); setError(null); setAbierta(true); }}
        className="borde-banda texto-banda inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition hover:border-naranjo"
      >
        <IconPencil size={14} /> Editar
      </button>
      <VentanaModal abierta={abierta} alCerrar={() => setAbierta(false)} titulo="Editar rendición" ancho="max-w-lg">
        <form action={guardar} className="space-y-4">
          <Campo etiqueta="Título" obligatorio>
            <input value={t} onChange={(e) => setT(e.target.value)} required className={CAMPO} />
          </Campo>
          <Campo etiqueta="Fondo entregado" ayuda="0 si no hubo fondo">
            <span className="relative block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gris">$</span>
              <input value={m} onChange={(e) => setM(e.target.value)} type="number" min="0" step="1" className={`${CAMPO} pl-7`} />
            </span>
          </Campo>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAbierta(false)} className="rounded-lg border border-borde px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gris hover:text-tinta">
              Cancelar
            </button>
            <button type="submit" disabled={pendiente} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-azul px-4 text-xs font-bold uppercase tracking-wide text-white hover:bg-azul-suave disabled:opacity-60">
              {pendiente && <RuedaCarga />} Guardar
            </button>
          </div>
        </form>
      </VentanaModal>
    </>
  );
}
