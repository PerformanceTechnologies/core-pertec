"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconAlertCircle, IconCalendarEvent, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { CAMPO, SOMBRA_CALIDA } from "@/lib/estilos";
import {
  COLUMNAS,
  PRIORIDADES,
  estaVencida,
  iniciales,
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

type Responsable = { correo: string; nombre: string };
type Edicion = { tipo: "nueva"; estado: EstadoTarea } | { tipo: "editar"; tarea: Tarea } | null;
type Destino = { estado: EstadoTarea; antesDe: string | null };

// Tonos del avatar: siempre el mismo para la misma persona.
const TONOS_AVATAR = [
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];
function tonoDe(correo: string): string {
  let h = 0;
  for (const c of correo) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONOS_AVATAR[h % TONOS_AVATAR.length];
}

export default function TableroTareas({
  tareas: iniciales_,
  responsables,
  yo,
}: {
  tareas: Tarea[];
  responsables: Responsable[];
  yo: string;
}) {
  // Copia local para mover al instante; el servidor confirma por detrás.
  const [tareas, setTareas] = useState(iniciales_);
  const [base, setBase] = useState(iniciales_);
  if (base !== iniciales_) {
    setBase(iniciales_);
    setTareas(iniciales_);
  }
  const [arrastrada, setArrastrada] = useState<string | null>(null);
  const [destino, setDestino] = useState<Destino | null>(null);
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [soloMias, setSoloMias] = useState(false);
  const router = useRouter();

  const nombreDe = useMemo(() => new Map(responsables.map((r) => [r.correo.toLowerCase(), r.nombre])), [responsables]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return tareas.filter(
      (t) =>
        (!soloMias || t.responsable?.toLowerCase() === yo.toLowerCase()) &&
        (!q || t.titulo.toLowerCase().includes(q) || (t.descripcion ?? "").toLowerCase().includes(q)),
    );
  }, [tareas, busqueda, soloMias, yo]);

  const deColumna = (lista: Tarea[], estado: EstadoTarea) =>
    lista.filter((t) => t.estado === estado).sort((a, b) => a.orden - b.orden);

  const vencidas = tareas.filter((t) => estaVencida(t)).length;
  const hechas = tareas.filter((t) => t.estado === "hecho").length;
  const avance = tareas.length ? Math.round((hechas / tareas.length) * 100) : 0;

  /** Deja la tarjeta `id` en `estado`, antes de `antesDeId` (o al final). Ordena contra la columna completa. */
  function soltar(id: string, estado: EstadoTarea, antesDeId: string | null) {
    const resto = deColumna(tareas, estado).filter((t) => t.id !== id);
    const i = antesDeId ? resto.findIndex((t) => t.id === antesDeId) : -1;
    const pos = i < 0 ? resto.length : i;
    const orden = ordenEntre(resto[pos - 1]?.orden ?? null, resto[pos]?.orden ?? null);
    const actual = tareas.find((t) => t.id === id);
    if (!actual || (actual.estado === estado && actual.orden === orden)) return;

    const antes = tareas;
    setTareas((ts) => ts.map((t) => (t.id === id ? { ...t, estado, orden } : t)));
    setError(null);
    moverTareaAction(id, estado, orden).then((r) => {
      if (!r.ok) {
        setError(r.error);
        setTareas(antes);
      }
    });
  }

  function terminarArrastre() {
    setArrastrada(null);
    setDestino(null);
  }

  return (
    <div className="space-y-5">
      {/* Resumen y filtros */}
      <div className={`flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-borde bg-superficie px-5 py-4 ${SOMBRA_CALIDA}`}>
        <Dato valor={tareas.length} etiqueta="tareas" />
        <Dato valor={tareas.filter((t) => t.estado === "en_curso").length} etiqueta="en curso" />
        <Dato valor={vencidas} etiqueta={vencidas === 1 ? "vencida" : "vencidas"} alerta={vencidas > 0} />
        <div className="min-w-40 flex-1">
          <div className="mb-1 flex justify-between text-xs text-gris">
            <span>Avance</span>
            <span className="font-semibold tabular-nums text-tinta">{avance}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-borde">
            <div className="h-full rounded-full bg-naranjo transition-all duration-500" style={{ width: `${avance}%` }} />
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="relative flex-1 sm:w-56 sm:flex-none">
            <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-suave" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar tarea"
              className={`${CAMPO} pl-9`}
              aria-label="Buscar tarea"
            />
          </label>
          <div className="flex rounded-lg border border-borde p-0.5 text-xs font-semibold">
            {[
              { v: false, t: "Todas" },
              { v: true, t: "Mías" },
            ].map((o) => (
              <button
                key={o.t}
                onClick={() => setSoloMias(o.v)}
                className={`rounded-md px-3 py-2 transition ${soloMias === o.v ? "bg-naranjo text-white" : "text-gris hover:text-tinta"}`}
              >
                {o.t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm text-rose-600">
          <IconAlertCircle size={16} /> {error}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {COLUMNAS.map((col) => {
          const lista = deColumna(visibles, col.estado);
          const activa = arrastrada !== null && destino?.estado === col.estado;
          return (
            <section
              key={col.estado}
              onDragOver={(e) => {
                e.preventDefault();
                if (destino?.estado !== col.estado || destino.antesDe !== null) {
                  if (e.target === e.currentTarget || !(e.target as HTMLElement).closest("article")) {
                    setDestino({ estado: col.estado, antesDe: null });
                  }
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (arrastrada && destino) soltar(arrastrada, destino.estado, destino.antesDe);
                terminarArrastre();
              }}
              className={`flex min-h-[22rem] flex-col rounded-2xl p-2.5 transition-colors duration-200 ${
                activa ? "bg-naranjo/[0.07] ring-2 ring-naranjo/30" : "bg-tinta/[0.03]"
              }`}
            >
              <header className="flex items-center justify-between px-2 pb-3 pt-1.5">
                <div className="flex items-center gap-2.5">
                  <span className={`h-2 w-2 rounded-full ${col.punto}`} />
                  <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-tinta">{col.titulo}</h2>
                  <span className="rounded-full bg-tinta/[0.06] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gris">
                    {lista.length}
                  </span>
                </div>
                <button
                  onClick={() => setEdicion({ tipo: "nueva", estado: col.estado })}
                  className="grid h-8 w-8 place-items-center rounded-lg text-gris transition hover:bg-superficie hover:text-naranjo"
                  title={`Agregar a ${col.titulo}`}
                >
                  <IconPlus size={17} />
                </button>
              </header>

              <div className="flex flex-1 flex-col gap-2">
                {lista.map((t) => (
                  <div key={t.id}>
                    {arrastrada && arrastrada !== t.id && destino?.estado === col.estado && destino.antesDe === t.id && <Marcador />}
                    <Tarjeta
                      tarea={t}
                      nombre={t.responsable ? nombreDe.get(t.responsable.toLowerCase()) ?? t.responsable : null}
                      arrastrando={arrastrada === t.id}
                      alArrastrar={() => setArrastrada(t.id)}
                      alPasarEncima={() => {
                        if (arrastrada && arrastrada !== t.id && (destino?.estado !== col.estado || destino.antesDe !== t.id)) {
                          setDestino({ estado: col.estado, antesDe: t.id });
                        }
                      }}
                      alTerminar={terminarArrastre}
                      alAbrir={() => setEdicion({ tipo: "editar", tarea: t })}
                    />
                  </div>
                ))}
                {arrastrada && destino?.estado === col.estado && destino.antesDe === null && lista.length > 0 && <Marcador />}

                {lista.length === 0 && (
                  <div
                    className={`grid flex-1 place-items-center rounded-xl border-2 border-dashed p-6 text-center text-xs transition ${
                      activa ? "border-naranjo/50 text-naranjo" : "border-borde text-gris-suave"
                    }`}
                  >
                    {busqueda || soloMias ? "Nada que coincida" : arrastrada ? "Suelta aquí" : "Sin tareas"}
                  </div>
                )}

                <button
                  onClick={() => setEdicion({ tipo: "nueva", estado: col.estado })}
                  className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-gris transition hover:bg-superficie hover:text-tinta"
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
        descripcion={
          edicion?.tipo === "nueva" ? `Se agrega en «${COLUMNAS.find((c) => c.estado === edicion.estado)?.titulo}».` : undefined
        }
        ancho="max-w-lg"
      >
        {edicion && (
          <FormularioTarea
            edicion={edicion}
            responsables={responsables}
            yo={yo}
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

function Dato({ valor, etiqueta, alerta = false }: { valor: number; etiqueta: string; alerta?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-2xl font-extrabold tabular-nums tracking-tight ${alerta ? "text-rose-600" : "text-tinta"}`}>{valor}</span>
      <span className="text-xs font-medium text-gris">{etiqueta}</span>
    </div>
  );
}

function Marcador() {
  return <div className="mx-1 mb-2 h-0.5 rounded-full bg-naranjo shadow-[0_0_0_3px_rgba(0,0,0,0)]" />;
}

function Avatar({ nombre, correo, chico = false }: { nombre: string; correo: string; chico?: boolean }) {
  return (
    <span
      title={nombre}
      className={`grid shrink-0 place-items-center rounded-full font-bold ${tonoDe(correo)} ${chico ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs"}`}
    >
      {iniciales(nombre)}
    </span>
  );
}

function Tarjeta({
  tarea: t,
  nombre,
  arrastrando,
  alArrastrar,
  alPasarEncima,
  alTerminar,
  alAbrir,
}: {
  tarea: Tarea;
  nombre: string | null;
  arrastrando: boolean;
  alArrastrar: () => void;
  alPasarEncima: () => void;
  alTerminar: () => void;
  alAbrir: () => void;
}) {
  const prioridad = PRIORIDADES.find((p) => p.valor === t.prioridad);
  const vencida = estaVencida(t);
  const hecha = t.estado === "hecho";
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", t.id);
        alArrastrar();
      }}
      onDragEnd={alTerminar}
      onDragOver={(e) => {
        e.preventDefault();
        alPasarEncima();
      }}
      onClick={alAbrir}
      className={`group relative cursor-grab overflow-hidden rounded-xl border border-borde bg-superficie py-3 pl-4 pr-3 transition duration-200 hover:-translate-y-0.5 hover:border-naranjo/40 active:cursor-grabbing ${SOMBRA_CALIDA} ${
        arrastrando ? "rotate-1 scale-[0.98] opacity-40" : ""
      } ${hecha ? "opacity-70" : ""}`}
    >
      {prioridad && <span className={`absolute inset-y-0 left-0 w-1 ${prioridad.barra}`} aria-hidden />}

      <p className={`text-[14px] font-semibold leading-snug ${hecha ? "text-gris line-through decoration-gris/50" : "text-tinta"}`}>
        {t.titulo}
      </p>
      {t.descripcion && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gris">{t.descripcion}</p>}

      <div className="mt-3 flex items-center gap-2">
        {prioridad && (
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${prioridad.tono}`}>
            {prioridad.etiqueta}
          </span>
        )}
        {t.fechaLimite && (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
              vencida ? "bg-rose-500/10 text-rose-600" : "text-gris"
            }`}
          >
            <IconCalendarEvent size={13} />
            {new Date(t.fechaLimite + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
          </span>
        )}
        <span className="flex-1" />
        {t.responsable && nombre && <Avatar nombre={nombre} correo={t.responsable} chico />}
      </div>
    </article>
  );
}

function FormularioTarea({
  edicion,
  responsables,
  yo,
  alTerminar,
  alMover,
}: {
  edicion: NonNullable<Edicion>;
  responsables: Responsable[];
  yo: string;
  alTerminar: () => void;
  alMover: (estado: EstadoTarea) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const t = edicion.tipo === "editar" ? edicion.tarea : null;
  const [prioridad, setPrioridad] = useState(t?.prioridad ?? "media");

  function enviar(fd: FormData) {
    setError(null);
    fd.set("prioridad", prioridad);
    iniciar(async () => {
      const r = t
        ? await actualizarTareaAction(t.id, fd)
        : await crearTareaAction(edicion.tipo === "nueva" ? edicion.estado : "por_hacer", fd);
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

  // Si el responsable guardado ya no es usuario activo, se mantiene visible en la lista.
  const actual = t?.responsable ?? "";
  const opciones =
    actual && !responsables.some((r) => r.correo.toLowerCase() === actual.toLowerCase())
      ? [...responsables, { correo: actual, nombre: `${actual} (inactivo)` }]
      : responsables;

  return (
    <form action={enviar} className="space-y-5">
      <input
        name="titulo"
        required
        autoFocus
        maxLength={200}
        defaultValue={t?.titulo ?? ""}
        placeholder="¿Qué hay que hacer?"
        className="w-full border-0 border-b border-borde bg-transparent px-0 pb-2 text-lg font-bold text-tinta placeholder:font-semibold placeholder:text-gris-suave focus:border-naranjo focus:outline-none focus:ring-0"
      />

      <Campo etiqueta="Descripción">
        <textarea name="descripcion" rows={3} defaultValue={t?.descripcion ?? ""} className={CAMPO} placeholder="Detalles, links, contexto…" />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Responsable">
          <select name="responsable" defaultValue={t ? actual : yo} className={CAMPO}>
            <option value="">Sin asignar</option>
            {opciones.map((r) => (
              <option key={r.correo} value={r.correo}>
                {r.nombre}
                {r.correo.toLowerCase() === yo.toLowerCase() ? " (tú)" : ""}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Fecha límite">
          <input name="fechaLimite" type="date" defaultValue={t?.fechaLimite ?? ""} className={CAMPO} />
        </Campo>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-semibold text-gris">Prioridad</span>
        <div className="grid grid-cols-3 gap-2">
          {PRIORIDADES.map((p) => (
            <button
              key={p.valor}
              type="button"
              onClick={() => setPrioridad(p.valor)}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                prioridad === p.valor ? "border-naranjo bg-naranjo/[0.06] text-tinta" : "border-borde text-gris hover:text-tinta"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${p.barra}`} /> {p.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {t && (
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-gris">Mover a</span>
          <div className="flex flex-wrap gap-2">
            {COLUMNAS.filter((c) => c.estado !== t.estado).map((c) => (
              <button
                key={c.estado}
                type="button"
                onClick={() => alMover(c.estado)}
                className="inline-flex items-center gap-2 rounded-lg border border-borde px-3 py-2 text-xs font-semibold text-tinta transition hover:border-naranjo/50"
              >
                <span className={`h-2 w-2 rounded-full ${c.punto}`} /> {c.titulo}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <div className="flex items-center justify-between gap-2 border-t border-borde pt-4">
        {t ? (
          <button
            type="button"
            onClick={eliminar}
            disabled={pendiente}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide text-rose-600 transition hover:bg-rose-500/10"
          >
            <IconTrash size={15} /> Eliminar
          </button>
        ) : (
          <span />
        )}
        <BotonGuardar pendiente={pendiente}>{t ? "Guardar cambios" : "Crear tarea"}</BotonGuardar>
      </div>
    </form>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-gris">{etiqueta}</span>
      {children}
    </label>
  );
}
