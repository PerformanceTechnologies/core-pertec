"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCalendar, IconPlus, IconTrash, IconUser } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { CAMPO, TARJETA } from "@/lib/estilos";
import {
  COLUMNAS,
  PRIORIDADES,
  estaVencida,
  ordenEntre,
  type EstadoTarea,
  type Tarea,
} from "@/lib/tareas-modelo";
import {
  actualizarTareaAction,
  crearTareaAction,
  eliminarTareaAction,
  moverTareaAction,
} from "@/app/(protegido)/tareas/acciones";

type Edicion = { tipo: "nueva"; estado: EstadoTarea } | { tipo: "editar"; tarea: Tarea } | null;

export default function TableroTareas({ tareas: iniciales }: { tareas: Tarea[] }) {
  // Copia local para mover al instante; el servidor confirma por detrás.
  const [tareas, setTareas] = useState(iniciales);
  const [base, setBase] = useState(iniciales);
  if (base !== iniciales) {
    setBase(iniciales);
    setTareas(iniciales);
  }
  const [arrastrada, setArrastrada] = useState<string | null>(null);
  const [sobre, setSobre] = useState<EstadoTarea | null>(null);
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const deColumna = (estado: EstadoTarea) =>
    tareas.filter((t) => t.estado === estado).sort((a, b) => a.orden - b.orden);

  /** Deja la tarjeta `id` en `estado`, antes de `antesDeId` (o al final). */
  function soltar(id: string, estado: EstadoTarea, antesDeId: string | null) {
    const resto = deColumna(estado).filter((t) => t.id !== id);
    const i = antesDeId ? resto.findIndex((t) => t.id === antesDeId) : resto.length;
    const pos = i < 0 ? resto.length : i;
    const orden = ordenEntre(resto[pos - 1]?.orden ?? null, resto[pos]?.orden ?? null);
    const actual = tareas.find((t) => t.id === id);
    if (!actual || (actual.estado === estado && actual.orden === orden)) return;

    setTareas((ts) => ts.map((t) => (t.id === id ? { ...t, estado, orden } : t)));
    setError(null);
    moverTareaAction(id, estado, orden).then((r) => {
      if (!r.ok) {
        setError(r.error);
        setTareas(base);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNAS.map((col) => {
          const lista = deColumna(col.estado);
          return (
            <section
              key={col.estado}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(col.estado);
              }}
              onDragLeave={() => setSobre((s) => (s === col.estado ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setSobre(null);
                if (arrastrada) soltar(arrastrada, col.estado, null);
                setArrastrada(null);
              }}
              className={`flex min-h-64 flex-col rounded-xl border bg-fondo/60 p-3 transition ${
                sobre === col.estado ? "border-cian bg-cian/5" : "border-borde"
              }`}
            >
              <header className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide text-tinta">
                  {col.titulo} <span className="ml-1 font-semibold text-gris">{lista.length}</span>
                </h2>
                <button
                  onClick={() => setEdicion({ tipo: "nueva", estado: col.estado })}
                  className="grid h-8 w-8 place-items-center rounded-lg text-gris transition hover:bg-borde hover:text-tinta"
                  title="Agregar tarea"
                >
                  <IconPlus size={16} />
                </button>
              </header>

              <div className="flex flex-1 flex-col gap-2">
                {lista.map((t) => (
                  <Tarjeta
                    key={t.id}
                    tarea={t}
                    arrastrando={arrastrada === t.id}
                    alArrastrar={() => setArrastrada(t.id)}
                    alSoltarEncima={() => {
                      if (arrastrada && arrastrada !== t.id) soltar(arrastrada, col.estado, t.id);
                      setArrastrada(null);
                      setSobre(null);
                    }}
                    alTerminar={() => {
                      setArrastrada(null);
                      setSobre(null);
                    }}
                    alAbrir={() => setEdicion({ tipo: "editar", tarea: t })}
                  />
                ))}
                {lista.length === 0 && (
                  <p className="grid flex-1 place-items-center rounded-lg border border-dashed border-borde p-4 text-center text-xs text-gris-suave">
                    Suelta una tarjeta aquí
                  </p>
                )}
                <button
                  onClick={() => setEdicion({ tipo: "nueva", estado: col.estado })}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-left text-sm font-semibold text-gris transition hover:bg-borde/60 hover:text-tinta"
                >
                  <IconPlus size={15} /> Agregar tarea
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <VentanaModal
        abierta={edicion !== null}
        alCerrar={() => setEdicion(null)}
        titulo={edicion?.tipo === "editar" ? "Editar tarea" : "Nueva tarea"}
        ancho="max-w-lg"
      >
        {edicion && (
          <FormularioTarea
            edicion={edicion}
            alTerminar={() => {
              setEdicion(null);
              router.refresh();
            }}
            alMover={(estado) => {
              if (edicion.tipo === "editar") soltar(edicion.tarea.id, estado, null);
              setEdicion(null);
            }}
          />
        )}
      </VentanaModal>
    </div>
  );
}

function Tarjeta({
  tarea: t,
  arrastrando,
  alArrastrar,
  alSoltarEncima,
  alTerminar,
  alAbrir,
}: {
  tarea: Tarea;
  arrastrando: boolean;
  alArrastrar: () => void;
  alSoltarEncima: () => void;
  alTerminar: () => void;
  alAbrir: () => void;
}) {
  const prioridad = PRIORIDADES.find((p) => p.valor === t.prioridad);
  const vencida = estaVencida(t);
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        alArrastrar();
      }}
      onDragEnd={alTerminar}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        alSoltarEncima();
      }}
      onClick={alAbrir}
      className={`${TARJETA} cursor-grab space-y-2 p-3 transition hover:border-cian active:cursor-grabbing ${
        arrastrando ? "opacity-40" : ""
      }`}
    >
      <p className={`text-sm font-semibold ${t.estado === "hecho" ? "text-gris line-through" : "text-tinta"}`}>{t.titulo}</p>
      {t.descripcion && <p className="line-clamp-2 text-xs text-gris">{t.descripcion}</p>}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {prioridad && <span className={`rounded-full px-2 py-0.5 font-semibold ${prioridad.tono}`}>{prioridad.etiqueta}</span>}
        {t.fechaLimite && (
          <span className={`inline-flex items-center gap-1 ${vencida ? "font-semibold text-rose-600" : "text-gris"}`}>
            <IconCalendar size={12} />
            {new Date(t.fechaLimite + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
          </span>
        )}
        {t.responsable && (
          <span className="inline-flex items-center gap-1 text-gris">
            <IconUser size={12} /> {t.responsable}
          </span>
        )}
      </div>
    </article>
  );
}

function FormularioTarea({
  edicion,
  alTerminar,
  alMover,
}: {
  edicion: NonNullable<Edicion>;
  alTerminar: () => void;
  alMover: (estado: EstadoTarea) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const t = edicion.tipo === "editar" ? edicion.tarea : null;

  function enviar(fd: FormData) {
    setError(null);
    iniciar(async () => {
      const r = t ? await actualizarTareaAction(t.id, fd) : await crearTareaAction(edicion.tipo === "nueva" ? edicion.estado : "por_hacer", fd);
      if (r.ok) alTerminar();
      else setError(r.error);
    });
  }

  function eliminar() {
    if (!t || !confirm(`¿Eliminar la tarea «${t.titulo}»?`)) return;
    iniciar(async () => {
      const r = await eliminarTareaAction(t.id);
      if (r.ok) alTerminar();
      else setError(r.error);
    });
  }

  return (
    <form action={enviar} className="space-y-4">
      <Campo etiqueta="Título">
        <input name="titulo" required autoFocus maxLength={200} defaultValue={t?.titulo ?? ""} className={CAMPO} />
      </Campo>
      <Campo etiqueta="Descripción">
        <textarea name="descripcion" rows={3} defaultValue={t?.descripcion ?? ""} className={CAMPO} placeholder="Opcional" />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Responsable">
          <input name="responsable" maxLength={120} defaultValue={t?.responsable ?? ""} className={CAMPO} placeholder="Opcional" />
        </Campo>
        <Campo etiqueta="Fecha límite">
          <input name="fechaLimite" type="date" defaultValue={t?.fechaLimite ?? ""} className={CAMPO} />
        </Campo>
      </div>
      <Campo etiqueta="Prioridad">
        <select name="prioridad" defaultValue={t?.prioridad ?? "media"} className={CAMPO}>
          {PRIORIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
        </select>
      </Campo>

      {t && (
        <div>
          <span className="mb-1 block text-xs font-semibold text-gris">Mover a</span>
          <div className="flex flex-wrap gap-2">
            {COLUMNAS.filter((c) => c.estado !== t.estado).map((c) => (
              <button
                key={c.estado}
                type="button"
                onClick={() => alMover(c.estado)}
                className="rounded-lg border border-borde px-3 py-2 text-xs font-semibold text-tinta transition hover:border-cian"
              >
                {c.titulo}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        {t ? (
          <button type="button" onClick={eliminar} disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase text-rose-600 hover:bg-rose-50">
            <IconTrash size={15} /> Eliminar
          </button>
        ) : <span />}
        <BotonGuardar pendiente={pendiente}>{t ? "Guardar" : "Crear tarea"}</BotonGuardar>
      </div>
    </form>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gris">{etiqueta}</span>
      {children}
    </label>
  );
}
