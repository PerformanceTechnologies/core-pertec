"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconEyeOff, IconPencil, IconPlus, IconRotate, IconX } from "@tabler/icons-react";
import { CAMPO, TARJETA } from "@/lib/estilos";
import { ETIQUETA_SECCION, type SeccionDocumento, type TipoDocumento } from "@/lib/flota-modelo";
import {
  activarTipoDocumentoAction,
  actualizarTipoDocumentoAction,
  crearTipoDocumentoAction,
} from "@/app/(protegido)/flota/acciones";

const AYUDA: Record<SeccionDocumento, string> = {
  base: "Los papeles del vehículo: padrón, permiso, SOAP, revisión técnica…",
  acreditacion: "Lo que pide la faena o minera para dejarlo entrar.",
};

/** La lista de documentos que se pide a cada vehículo, editable en el lugar. */
export default function ConfigDocumentos({ tipos }: { tipos: TipoDocumento[] }) {
  const [seccion, setSeccion] = useState<SeccionDocumento>("base");
  const [verQuitados, setVerQuitados] = useState(false);
  const deEsta = tipos.filter((t) => t.seccion === seccion);
  const activos = deEsta.filter((t) => t.activo);
  const quitados = deEsta.filter((t) => !t.activo);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-xl border border-borde bg-superficie p-1">
          {(Object.keys(ETIQUETA_SECCION) as SeccionDocumento[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeccion(s)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                seccion === s ? "bg-tinta text-superficie" : "text-gris hover:bg-tinta/[0.05] hover:text-tinta"
              }`}
            >
              {s === "base" ? "Documentos base" : "Acreditación"}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${seccion === s ? "bg-white/15" : "bg-tinta/[0.06]"}`}>
                {tipos.filter((t) => t.seccion === s && t.activo).length}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gris">{AYUDA[seccion]}</p>
      </div>

      <section className={`${TARJETA} overflow-hidden`}>
        <div className="hidden grid-cols-[minmax(0,1fr)_11rem_6rem] gap-4 border-b border-borde bg-tinta/[0.02] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gris sm:grid">
          <span>Documento</span>
          <span>¿Tiene vencimiento?</span>
          <span />
        </div>
        <ul className="divide-y divide-borde">
          {activos.map((t) => <Fila key={t.id} tipo={t} />)}
          {activos.length === 0 && <li className="px-5 py-8 text-center text-sm text-gris">No se pide ningún documento en esta sección.</li>}
        </ul>
        <Agregar seccion={seccion} />
        {quitados.length > 0 && (
          <div className="border-t border-borde">
            <button type="button" onClick={() => setVerQuitados((v) => !v)} className="w-full px-5 py-2.5 text-left text-xs font-semibold text-gris hover:text-tinta">
              {verQuitados ? "Ocultar" : "Ver"} {quitados.length} que ya no se {quitados.length === 1 ? "pide" : "piden"}
            </button>
            {verQuitados && <ul className="divide-y divide-borde border-t border-dashed border-borde">{quitados.map((t) => <Fila key={t.id} tipo={t} />)}</ul>}
          </div>
        )}
      </section>
      <p className="text-xs text-gris-suave">
        Los cambios se ven en la ficha de todos los vehículos. Quitar un documento no borra lo que ya se subió; para un vehículo puntual, márcalo «no aplica» en su ficha.
      </p>
    </div>
  );
}

function Fila({ tipo }: { tipo: TipoDocumento }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(tipo.nombre);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  const correr = (f: () => Promise<{ ok: boolean; error?: string }>, despues?: () => void) =>
    iniciar(async () => {
      setError(null);
      const r = await f();
      if (!r.ok) return setError(r.error ?? "No se pudo guardar.");
      despues?.();
      router.refresh();
    });

  function guardarNombre() {
    if (nombre.trim() === tipo.nombre) return setEditando(false);
    correr(() => actualizarTipoDocumentoAction(tipo.id, { nombre }), () => setEditando(false));
  }

  return (
    <li className={`grid items-center gap-x-4 gap-y-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_11rem_6rem] ${tipo.activo ? "" : "opacity-55"} ${pendiente ? "opacity-60" : ""}`}>
      <div className="min-w-0">
        {editando ? (
          <form action={guardarNombre} className="flex items-center gap-1.5">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Escape" && (setNombre(tipo.nombre), setEditando(false))}
              className={`${CAMPO} py-2`}
              aria-label="Nombre del documento"
            />
            <button type="submit" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-azul text-white hover:bg-azul-suave" aria-label="Guardar nombre">
              <IconCheck size={16} />
            </button>
            <button type="button" onClick={() => { setNombre(tipo.nombre); setEditando(false); }} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-gris hover:text-tinta" aria-label="Cancelar">
              <IconX size={16} />
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => tipo.activo && setEditando(true)} className="group flex w-full items-center gap-2 text-left" disabled={!tipo.activo}>
            <span className={`text-sm ${tipo.activo ? "text-tinta" : "text-gris line-through"}`}>{tipo.nombre}</span>
            {tipo.activo && <IconPencil size={14} className="shrink-0 text-gris-suave opacity-0 transition group-hover:opacity-100" />}
          </button>
        )}
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      </div>

      {/* Vence o no: dos opciones, la elegida resaltada. */}
      <div className="inline-flex w-fit rounded-lg border border-borde p-0.5 text-xs font-semibold">
        {[
          { v: true, t: "Vence" },
          { v: false, t: "No vence" },
        ].map((o) => (
          <button
            key={o.t}
            type="button"
            disabled={pendiente || !tipo.activo || tipo.vence === o.v}
            onClick={() => correr(() => actualizarTipoDocumentoAction(tipo.id, { vence: o.v }))}
            className={`rounded-md px-2.5 py-1.5 transition ${tipo.vence === o.v ? (o.v ? "bg-amber-500/15 text-amber-700" : "bg-tinta/[0.07] text-tinta") : "text-gris hover:text-tinta"}`}
          >
            {o.t}
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        {tipo.activo ? (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => activarTipoDocumentoAction(tipo.id, false))}
            title="Dejar de pedirlo"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-gris transition hover:bg-rose-500/10 hover:text-rose-600"
          >
            <IconEyeOff size={14} /> Quitar
          </button>
        ) : (
          <button type="button" disabled={pendiente} onClick={() => correr(() => activarTipoDocumentoAction(tipo.id, true))} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-cian hover:underline">
            <IconRotate size={14} /> Volver a pedir
          </button>
        )}
      </div>
    </li>
  );
}

function Agregar({ seccion }: { seccion: SeccionDocumento }) {
  const [abierto, setAbierto] = useState(false);
  const [vence, setVence] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  function enviar(fd: FormData) {
    setError(null);
    fd.set("seccion", seccion);
    fd.set("vence", vence ? "si" : "no");
    iniciar(async () => {
      const r = await crearTipoDocumentoAction(fd);
      if (!r.ok) return setError(r.error);
      setAbierto(false);
      setVence(true);
      router.refresh();
    });
  }

  if (!abierto)
    return (
      <div className="border-t border-borde bg-tinta/[0.015] px-5 py-3">
        <button type="button" onClick={() => setAbierto(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-cian hover:underline">
          <IconPlus size={15} /> Agregar documento a {seccion === "base" ? "documentos base" : "acreditación"}
        </button>
      </div>
    );

  return (
    <form action={enviar} className="flex flex-wrap items-center gap-2 border-t border-borde bg-naranjo/[0.03] px-5 py-3">
      <input name="nombre" autoFocus required placeholder="Ej: Certificado de grúa" className={`${CAMPO} min-w-56 flex-1`} />
      <div className="inline-flex rounded-lg border border-borde bg-superficie p-0.5 text-xs font-semibold">
        {[
          { v: true, t: "Vence" },
          { v: false, t: "No vence" },
        ].map((o) => (
          <button key={o.t} type="button" onClick={() => setVence(o.v)} className={`rounded-md px-2.5 py-2 transition ${vence === o.v ? "bg-tinta text-superficie" : "text-gris hover:text-tinta"}`}>
            {o.t}
          </button>
        ))}
      </div>
      <button type="submit" disabled={pendiente} className="min-h-11 rounded-lg bg-naranjo px-4 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-naranjo-suave disabled:opacity-60">
        Agregar
      </button>
      <button type="button" onClick={() => setAbierto(false)} className="grid h-11 w-10 place-items-center text-gris hover:text-tinta" aria-label="Cancelar">
        <IconX size={16} />
      </button>
      {error && <p className="w-full text-sm text-rose-600">{error}</p>}
    </form>
  );
}
