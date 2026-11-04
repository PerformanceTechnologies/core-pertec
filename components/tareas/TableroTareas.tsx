"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertCircle,
  IconCalendarEvent,
  IconFile,
  IconHistory,
  IconLock,
  IconNotes,
  IconPaperclip,
  IconPlus,
  IconSearch,
  IconSend,
  IconTrash,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import BotonGuardar from "@/components/inventario/BotonGuardar";
import { CAMPO, SOMBRA_CALIDA } from "@/lib/estilos";
import { LIMITE_SUBIDA, leerRespuesta } from "@/lib/subidas";
import {
  ADJUNTOS_ACEPTADOS,
  COLUMNAS,
  PRIORIDADES,
  TIPOS_ADJUNTO,
  esDeLaTarea,
  estaVencida,
  etiquetaFechas,
  iniciales,
  ordenEntre,
  pesoLegible,
  type EstadoTarea,
  type EventoHistorial,
  type Nota,
  type Tarea,
} from "@/lib/tareas-modelo";
import {
  actualizarTareaAction,
  crearTareaAction,
  descargarAdjuntoAction,
  eliminarNotaAction,
  eliminarTareaAction,
  historialAction,
  moverTareaAction,
  notasAction,
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
  abrir = null,
}: {
  tareas: Tarea[];
  responsables: Responsable[];
  yo: string;
  /** Id de una tarea para abrirla de entrada (los enlaces de Mi Día). */
  abrir?: string | null;
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
  const [edicion, setEdicion] = useState<Edicion>(() => {
    const t = abrir ? iniciales_.find((x) => x.id === abrir) : undefined;
    return t ? { tipo: "editar", tarea: t } : null;
  });
  // Un enlace nuevo con ?abrir= (desde la campana) estando ya en el tablero: abre esa tarea.
  const [abrirPrevio, setAbrirPrevio] = useState(abrir);
  if (abrir !== abrirPrevio) {
    setAbrirPrevio(abrir);
    const t = abrir ? iniciales_.find((x) => x.id === abrir) : undefined;
    if (t) setEdicion({ tipo: "editar", tarea: t });
  }
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [soloMias, setSoloMias] = useState(false);
  const router = useRouter();

  const nombreDe = useMemo(() => new Map(responsables.map((r) => [r.correo.toLowerCase(), r.nombre])), [responsables]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return tareas.filter(
      (t) =>
        (!soloMias || t.responsables.some((c) => c.toLowerCase() === yo.toLowerCase())) &&
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
                      personas={t.responsables.map((c) => ({ correo: c, nombre: nombreDe.get(c.toLowerCase()) ?? c }))}
                      asignadoPor={t.asignadoPor ? nombreDe.get(t.asignadoPor.toLowerCase()) ?? t.asignadoPor : null}
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
        ancho="max-w-5xl"
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

function Avatar({ nombre, correo, chico = false, anillo = false }: { nombre: string; correo: string; chico?: boolean; anillo?: boolean }) {
  return (
    <span
      title={nombre}
      className={`grid shrink-0 place-items-center rounded-full bg-superficie font-bold ${chico ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs"} ${
        anillo ? "ring-2 ring-superficie" : ""
      }`}
    >
      <span className={`grid h-full w-full place-items-center rounded-full ${tonoDe(correo)}`}>{iniciales(nombre)}</span>
    </span>
  );
}

/** Varios responsables: los elegidos como fichas, y una lista para sumar más. */
function SelectorResponsables({
  opciones,
  elegidos,
  setElegidos,
  yo,
}: {
  opciones: Responsable[];
  elegidos: string[];
  setElegidos: (v: string[]) => void;
  yo: string;
}) {
  const esYo = (c: string) => c.toLowerCase() === yo.toLowerCase();
  const nombre = (c: string) => opciones.find((o) => o.correo.toLowerCase() === c.toLowerCase())?.nombre ?? c;
  const libres = opciones.filter((o) => !elegidos.some((e) => e.toLowerCase() === o.correo.toLowerCase()));
  return (
    <div className="space-y-2">
      {elegidos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {elegidos.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-borde bg-superficie py-1 pl-1 pr-2 text-xs font-semibold text-tinta">
              <Avatar nombre={nombre(c)} correo={c} chico />
              {nombre(c)}
              {esYo(c) ? " (tú)" : ""}
              <input type="hidden" name="responsables" value={c} />
              <button
                type="button"
                onClick={() => setElegidos(elegidos.filter((e) => e !== c))}
                className="grid h-4 w-4 place-items-center rounded-full text-gris transition hover:bg-rose-500/10 hover:text-rose-600"
                aria-label={`Quitar a ${nombre(c)}`}
              >
                <IconX size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {libres.length > 0 && (
        <BuscadorPersona
          opciones={libres}
          yo={yo}
          placeholder={elegidos.length ? "+ Agregar otro responsable: escribe un nombre" : "Escribe un nombre para asignar"}
          alElegir={(c) => setElegidos([...elegidos, c])}
        />
      )}
    </div>
  );
}


function Tarjeta({
  tarea: t,
  personas,
  asignadoPor,
  arrastrando,
  alArrastrar,
  alPasarEncima,
  alTerminar,
  alAbrir,
}: {
  tarea: Tarea;
  personas: Responsable[];
  asignadoPor: string | null;
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

      {!t.visibleGeneral && (
        <span className="float-right ml-2 mt-0.5 text-gris-suave" title="Privada: solo responsables y quien la asignó">
          <IconLock size={14} />
        </span>
      )}
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
        {(t.fechaLimite || t.fechaInicio) && (
          <span
            title={t.fechaInicio ? "Rango de fechas de la tarea" : "Fecha límite"}
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
              vencida ? "bg-rose-500/10 text-rose-600" : "text-gris"
            }`}
          >
            <IconCalendarEvent size={13} />
            {etiquetaFechas(t)}
          </span>
        )}
        <span className="flex-1" />
        {personas.length > 0 && (
          <span className="flex -space-x-1.5" title={personas.map((p) => p.nombre).join(", ") + (asignadoPor ? ` · asignada por ${asignadoPor}` : "")}>
            {personas.slice(0, 3).map((p) => (
              <Avatar key={p.correo} nombre={p.nombre} correo={p.correo} chico anillo />
            ))}
            {personas.length > 3 && (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-borde text-[10px] font-bold text-gris ring-2 ring-superficie">
                +{personas.length - 3}
              </span>
            )}
          </span>
        )}
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
  const [elegidos, setElegidos] = useState<string[]>(t ? t.responsables : [yo]);
  const [visibleGeneral, setVisibleGeneral] = useState(t?.visibleGeneral ?? true);
  // Con «Desde» la tarea pasa a ser un rango; sin él, la fecha límite es la única fecha.
  const [conRango, setConRango] = useState(Boolean(t?.fechaInicio));
  const [desde, setDesde] = useState(t?.fechaInicio ?? "");
  const [hasta, setHasta] = useState(t?.fechaLimite ?? "");
  const [versionHistorial, setVersionHistorial] = useState(0);
  // La visibilidad solo la cambian responsables y quien asignó; al crear, quien crea.
  const puedeCambiarVisibilidad = !t || esDeLaTarea(t, yo);

  function enviar(fd: FormData) {
    setError(null);
    fd.set("prioridad", prioridad);
    fd.set("visibleGeneral", visibleGeneral ? "si" : "no");
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

  // Quien estaba en la tarea y ya no es usuario activo se sigue viendo, marcado como inactivo.
  const previos = t ? [...t.responsables, ...(t.asignadoPor ? [t.asignadoPor] : [])] : [];
  const opciones = [
    ...responsables,
    ...[...new Set(previos)]
      .filter((c) => !responsables.some((r) => r.correo.toLowerCase() === c.toLowerCase()))
      .map((c) => ({ correo: c, nombre: `${c} (inactivo)` })),
  ];

  return (
    <form action={enviar} className="-mx-1">
      <div className="grid gap-8 px-1 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ── Columna principal: qué es, la conversación y lo que pasó ── */}
        <div className="min-w-0 space-y-6">
          <div>
            {t && (
              <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-tinta/[0.05] px-2.5 py-1 text-[11px] font-semibold text-gris">
                <span className={`h-2 w-2 rounded-full ${COLUMNAS.find((c) => c.estado === t.estado)?.punto}`} />
                {COLUMNAS.find((c) => c.estado === t.estado)?.titulo}
                {!visibleGeneral && (
                  <>
                    <span className="text-gris-suave">·</span> <IconLock size={12} /> Privada
                  </>
                )}
              </span>
            )}
            <input
              name="titulo"
              required
              autoFocus={!t}
              maxLength={200}
              defaultValue={t?.titulo ?? ""}
              placeholder="¿Qué hay que hacer?"
              className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 -mx-2 text-2xl font-extrabold tracking-tight text-tinta placeholder:font-bold placeholder:text-gris-suave hover:border-borde focus:border-cian focus:outline-none focus:ring-2 focus:ring-cian/30"
            />
          </div>

          <div>
            <Etiqueta>Descripción</Etiqueta>
            <textarea
              name="descripcion"
              rows={4}
              defaultValue={t?.descripcion ?? ""}
              className={`${CAMPO} leading-relaxed`}
              placeholder="Detalles, links, contexto…"
            />
          </div>

          {t ? (
            <>
              <Actividad
                notas={<Notas tareaId={t.id} yo={yo} alCambiar={() => setVersionHistorial((v) => v + 1)} />}
                historial={<Historial tareaId={t.id} version={versionHistorial} />}
              />
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-borde px-4 py-5 text-center text-xs text-gris">
              Las notas, los archivos y el historial aparecen cuando la tarea ya está creada.
            </p>
          )}
        </div>

        {/* ── Barra lateral: los datos de la tarea ── */}
        <aside className="space-y-5 lg:sticky lg:top-0 lg:self-start">
          <div className="space-y-5 rounded-2xl border border-borde bg-tinta/[0.02] p-4">
            {t && (
              <div>
                <Etiqueta>Estado</Etiqueta>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-tinta/[0.05] p-1">
                  {COLUMNAS.map((c) => {
                    const actual = c.estado === t.estado;
                    return (
                      <button
                        key={c.estado}
                        type="button"
                        onClick={() => !actual && alMover(c.estado)}
                        className={`flex items-center justify-center gap-1.5 rounded-md px-1 py-1.5 text-[11px] font-semibold transition ${
                          actual ? "bg-superficie text-tinta shadow-sm" : "text-gris hover:text-tinta"
                        }`}
                        title={actual ? "Estado actual" : `Mover a ${c.titulo}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${c.punto}`} />
                        {c.titulo}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <Etiqueta>Prioridad</Etiqueta>
              <div className="grid grid-cols-3 gap-1.5">
                {PRIORIDADES.map((p) => (
                  <button
                    key={p.valor}
                    type="button"
                    onClick={() => setPrioridad(p.valor)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                      prioridad === p.valor ? "border-naranjo bg-naranjo/[0.07] text-tinta" : "border-borde bg-superficie text-gris hover:text-tinta"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${p.barra}`} /> {p.etiqueta}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-gris">{conRango ? "Rango de fechas" : "Fecha límite"}</span>
                <div className="inline-flex rounded-lg border border-borde p-0.5 text-[11px] font-semibold">
                  {([false, true] as const).map((rango) => (
                    <button
                      key={String(rango)}
                      type="button"
                      onClick={() => {
                        setConRango(rango);
                        if (!rango) setDesde("");
                      }}
                      className={`rounded-md px-2 py-1 transition ${conRango === rango ? "bg-naranjo text-white" : "text-gris hover:text-tinta"}`}
                    >
                      {rango ? "Rango" : "Un día"}
                    </button>
                  ))}
                </div>
              </div>
              {conRango ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-gris">Desde</span>
                    <input
                      name="fechaInicio"
                      type="date"
                      value={desde}
                      max={hasta || undefined}
                      onChange={(e) => setDesde(e.target.value)}
                      className={CAMPO}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-gris">Hasta (fecha límite)</span>
                    <input name="fechaLimite" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className={CAMPO} />
                  </label>
                </div>
              ) : (
                <input name="fechaLimite" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={CAMPO} />
              )}
              {conRango && desde && hasta && desde > hasta && <p className="mt-1 text-[11px] text-rose-600">«Desde» no puede ser después de «Hasta».</p>}
            </div>

            <div className="h-px bg-borde" />

            <div>
              <Etiqueta>Responsables</Etiqueta>
              <SelectorResponsables opciones={opciones} elegidos={elegidos} setElegidos={setElegidos} yo={yo} />
            </div>

            <div>
              <Etiqueta>Asignado por</Etiqueta>
              <select name="asignadoPor" defaultValue={t ? t.asignadoPor ?? "" : yo} className={CAMPO}>
                <option value="">—</option>
                {opciones.map((r) => (
                  <option key={r.correo} value={r.correo}>
                    {r.nombre}
                    {r.correo.toLowerCase() === yo.toLowerCase() ? " (tú)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <VistaGeneral activa={visibleGeneral} cambiar={setVisibleGeneral} bloqueada={!puedeCambiarVisibilidad} />
        </aside>
      </div>

      {error && <p className="mx-1 mt-5 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <div className="mx-1 mt-6 flex items-center justify-between gap-2 border-t border-borde pt-4">
        {t ? (
          <button
            type="button"
            onClick={eliminar}
            disabled={pendiente}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide text-rose-600 transition hover:bg-rose-500/10"
          >
            <IconTrash size={15} /> Eliminar tarea
          </button>
        ) : (
          <span />
        )}
        <BotonGuardar pendiente={pendiente}>{t ? "Guardar cambios" : "Crear tarea"}</BotonGuardar>
      </div>
    </form>
  );
}


const VERBO: Record<EventoHistorial["accion"], string> = {
  creada: "creó la tarea",
  editada: "actualizó",
  estado: "cambió el estado",
  nota: "agregó",
};

/** "hace 5 min", "hace 3 h", "ayer", o la fecha si es más vieja. */
function haceCuanto(iso: string): string {
  const seg = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seg < 60) return "recién";
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  if (seg < 172800) return "ayer";
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
}

function Historial({ tareaId, version }: { tareaId: string; version: number }) {
  const [eventos, setEventos] = useState<EventoHistorial[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verTodo, setVerTodo] = useState(false);

  useEffect(() => {
    let vigente = true;
    historialAction(tareaId).then((r) => {
      if (!vigente) return;
      if (r.ok) setEventos(r.eventos);
      else setError(r.error);
    });
    return () => {
      vigente = false;
    };
  }, [tareaId, version]);

  const ultimo = eventos?.[0];

  return (
    <section className="rounded-xl border border-borde bg-tinta/[0.02] p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-tinta">
          <IconHistory size={15} /> Historial
        </h3>
        {ultimo && (
          <span className="text-[11px] text-gris" title={new Date(ultimo.creadoEn).toLocaleString("es-CL")}>
            Actualizada {haceCuanto(ultimo.creadoEn)} por <strong className="font-semibold text-tinta">{ultimo.nombre ?? ultimo.correo}</strong>
          </span>
        )}
      </header>

      {error && <p className="text-xs text-rose-600">{error}</p>}
      {!error && eventos === null && <p className="text-xs text-gris">Cargando…</p>}
      {eventos && eventos.length === 0 && (
        <p className="text-xs text-gris">Sin movimientos registrados todavía. Desde ahora se anota cada cambio.</p>
      )}

      {eventos && eventos.length > 0 && <ListaEventos eventos={eventos.slice(0, 3)} />}

      {eventos && eventos.length > 3 && (
        <button
          type="button"
          onClick={() => setVerTodo(true)}
          className="mt-3 w-full rounded-lg border border-borde py-2 text-xs font-semibold text-gris transition hover:border-naranjo/50 hover:text-tinta"
        >
          Ver más ({eventos.length - 3} anteriores)
        </button>
      )}

      <VentanaModal abierta={verTodo} alCerrar={() => setVerTodo(false)} titulo="Historial completo" ancho="max-w-lg">
        {eventos && <ListaEventos eventos={eventos} />}
      </VentanaModal>
    </section>
  );
}

function ListaEventos({ eventos }: { eventos: EventoHistorial[] }) {
  return (
    <ol className="space-y-3">
      {eventos.map((e, i) => {
        const quien = e.nombre ?? e.correo ?? "Alguien";
        return (
          <li key={e.id} className="relative flex gap-3">
            {i < eventos.length - 1 && <span className="absolute left-3 top-7 h-[calc(100%-4px)] w-px bg-borde" aria-hidden />}
            <Avatar nombre={quien} correo={e.correo ?? quien} chico />
            <div className="min-w-0 flex-1 text-xs leading-relaxed">
              <p className="text-tinta">
                <strong className="font-semibold">{quien}</strong> <span className="text-gris">{VERBO[e.accion]}</span> {e.detalle}
              </p>
              <p className="text-[11px] text-gris-suave">
                {haceCuanto(e.creadoEn)} · {new Date(e.creadoEn).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function VistaGeneral({ activa, cambiar, bloqueada }: { activa: boolean; cambiar: (v: boolean) => void; bloqueada: boolean }) {
  return (
    <section
      className={`flex items-start gap-3 rounded-xl border p-3.5 transition ${
        activa ? "border-borde bg-tinta/[0.02]" : "border-naranjo/40 bg-naranjo/[0.05]"
      }`}
    >
      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${activa ? "bg-sky-500/10 text-sky-600" : "bg-naranjo/10 text-naranjo"}`}>
        {activa ? <IconWorld size={17} /> : <IconLock size={17} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-tinta">Vista general</p>
        <p className="text-xs leading-relaxed text-gris">
          {activa
            ? "La ve todo el que tiene acceso a Tareas."
            : "Privada: solo la ven sus responsables y quien la asignó."}
          {bloqueada && " Solo ellos pueden cambiar esto."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={activa}
        aria-label="Vista general"
        disabled={bloqueada}
        onClick={() => cambiar(!activa)}
        className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
          activa ? "bg-naranjo" : "bg-borde"
        }`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${activa ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </section>
  );
}

const ACEPTA_ARCHIVOS = Object.keys(TIPOS_ADJUNTO).join(",");

function Notas({ tareaId, yo, alCambiar }: { tareaId: string; yo: string; alCambiar: () => void }) {
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [version, setVersion] = useState(0);
  const [texto, setTexto] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vigente = true;
    notasAction(tareaId).then((r) => {
      if (!vigente) return;
      if (r.ok) setNotas(r.notas);
      else setError(r.error);
    });
    return () => {
      vigente = false;
    };
  }, [tareaId, version]);

  function elegir(lista: FileList | null) {
    if (!lista) return;
    setError(null);
    const nuevos = [...lista];
    for (const f of nuevos) {
      if (!Object.hasOwn(TIPOS_ADJUNTO, f.type)) return setError(`"${f.name}" no se puede adjuntar. Se aceptan ${ADJUNTOS_ACEPTADOS}.`);
    }
    const todos = [...archivos, ...nuevos];
    const total = todos.reduce((t, f) => t + f.size, 0);
    if (total > LIMITE_SUBIDA) {
      return setError(`Los archivos de una nota no pueden pasar de 4 MB en total (van ${pesoLegible(total)}).`);
    }
    setArchivos(todos.slice(0, 10));
  }

  async function publicar() {
    if (!texto.trim() && archivos.length === 0) return;
    setError(null);
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.set("tareaId", tareaId);
      fd.set("texto", texto);
      for (const a of archivos) fd.append("archivos", a);
      await leerRespuesta<{ ok: true }>(await fetch("/api/tareas/notas", { method: "POST", body: fd }));
      setTexto("");
      setArchivos([]);
      setVersion((v) => v + 1);
      alCambiar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la nota.");
    } finally {
      setEnviando(false);
    }
  }

  async function borrar(n: Nota) {
    if (!confirm("¿Eliminar esta nota y sus archivos?")) return;
    const r = await eliminarNotaAction(n.id);
    if (r.ok) setVersion((v) => v + 1);
    else setError(r.error);
  }

  async function abrir(n: Nota, i: number) {
    const r = await descargarAdjuntoAction(n.id, i);
    if (r.ok) window.open(r.url, "_blank", "noopener");
    else setError(r.error);
  }

  return (
    <section className="rounded-xl border border-borde p-4">

      {/* Redactar: no es un <form> porque ya está dentro del de la tarea. */}
      <div className="rounded-lg border border-borde bg-superficie focus-within:border-cian focus-within:ring-2 focus-within:ring-cian/30">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              publicar();
            }
          }}
          rows={2}
          maxLength={8000}
          placeholder="Escribe una nota…"
          className="block w-full resize-y border-0 bg-transparent px-3 py-2.5 text-sm text-tinta placeholder:text-gris-suave focus:outline-none focus:ring-0"
        />
        {archivos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {archivos.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-md bg-tinta/[0.05] px-2 py-1 text-[11px] text-tinta">
                <IconFile size={12} /> <span className="max-w-40 truncate">{a.name}</span>
                <span className="text-gris">{pesoLegible(a.size)}</span>
                <button type="button" onClick={() => setArchivos(archivos.filter((_, j) => j !== i))} className="text-gris hover:text-rose-600" aria-label={`Quitar ${a.name}`}>
                  <IconX size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-borde px-2 py-1.5">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-gris transition hover:bg-tinta/[0.05] hover:text-tinta">
            <IconPaperclip size={15} /> Adjuntar
            <input
              type="file"
              multiple
              accept={ACEPTA_ARCHIVOS}
              className="sr-only"
              onChange={(e) => {
                elegir(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={publicar}
            disabled={enviando || (!texto.trim() && archivos.length === 0)}
            className="inline-flex items-center gap-1.5 rounded-md bg-naranjo px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-naranjo-suave disabled:opacity-40"
          >
            <IconSend size={14} /> {enviando ? "Guardando…" : "Agregar nota"}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

      {notas === null && !error && <p className="mt-3 text-xs text-gris">Cargando…</p>}
      {notas && notas.length > 0 && (
        <ul className="mt-4 max-h-56 space-y-4 overflow-y-auto overscroll-contain pr-1">
          {notas.map((n) => {
            const quien = n.nombre ?? n.correo;
            const mia = n.correo.toLowerCase() === yo.toLowerCase();
            return (
              <li key={n.id} className="group flex gap-3">
                <Avatar nombre={quien} correo={n.correo} chico />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 text-xs">
                    <strong className="font-semibold text-tinta">{quien}</strong>
                    <span className="text-[11px] text-gris-suave" title={new Date(n.creadoEn).toLocaleString("es-CL")}>
                      {haceCuanto(n.creadoEn)}
                    </span>
                    {mia && (
                      <button
                        type="button"
                        onClick={() => borrar(n)}
                        className="ml-auto text-gris-suave opacity-0 transition hover:text-rose-600 group-hover:opacity-100"
                        aria-label="Eliminar nota"
                      >
                        <IconTrash size={13} />
                      </button>
                    )}
                  </div>
                  {n.texto && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-tinta">{n.texto}</p>}
                  {n.archivos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {n.archivos.map((a, i) => (
                        <button
                          key={a.ruta}
                          type="button"
                          onClick={() => abrir(n, i)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-[11px] font-medium text-tinta transition hover:border-naranjo/50"
                          title={`Descargar ${a.nombre}`}
                        >
                          <IconFile size={13} className="text-naranjo" />
                          <span className="max-w-44 truncate">{a.nombre}</span>
                          <span className="text-gris">{pesoLegible(a.tamano)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-gris">{children}</span>;
}

/**
 * Notas e Historial en pestañas, en el mismo lugar: así la ventana no crece con cada nota
 * o cambio (cada lista se desplaza dentro de su propio alto). Las dos quedan montadas
 * para no perder lo escrito ni volver a cargar al cambiar de pestaña.
 */
function Actividad({ notas, historial }: { notas: React.ReactNode; historial: React.ReactNode }) {
  const [pestana, setPestana] = useState<"notas" | "historial">("notas");
  const opciones = [
    { v: "notas" as const, t: "Notas", I: IconNotes },
    { v: "historial" as const, t: "Historial", I: IconHistory },
  ];
  return (
    <div>
      <div className="mb-3 flex gap-1 border-b border-borde">
        {opciones.map(({ v, t, I }) => (
          <button
            key={v}
            type="button"
            onClick={() => setPestana(v)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] transition ${
              pestana === v ? "border-naranjo text-tinta" : "border-transparent text-gris hover:text-tinta"
            }`}
          >
            <I size={15} /> {t}
          </button>
        ))}
      </div>
      <div className={pestana === "notas" ? "" : "hidden"}>{notas}</div>
      <div className={pestana === "historial" ? "" : "hidden"}>{historial}</div>
    </div>
  );
}

/**
 * Un campo donde se escribe y se elige a una persona: filtra por nombre o correo (sin
 * importar tildes ni mayúsculas) y se maneja también con el teclado (↑ ↓, Enter, Esc).
 */
function BuscadorPersona({
  opciones,
  yo,
  placeholder,
  alElegir,
}: {
  opciones: Responsable[];
  yo: string;
  placeholder: string;
  alElegir: (correo: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const idLista = useId();
  const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = sinTildes(texto.trim());
  const filtradas = opciones.filter((o) => !q || sinTildes(o.nombre).includes(q) || o.correo.toLowerCase().includes(q)).slice(0, 8);
  const esYo = (c: string) => c.toLowerCase() === yo.toLowerCase();

  function elegir(o: Responsable) {
    alElegir(o.correo);
    setTexto("");
    setMarcado(0);
  }

  return (
    <div className="relative">
      <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-suave" />
      <input
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setMarcado(0);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAbierto(true);
            setMarcado((m) => Math.min(m + 1, filtradas.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setMarcado((m) => Math.max(m - 1, 0));
          } else if (e.key === "Enter") {
            // Enter elige a la persona marcada y NO envía el formulario de la tarea.
            e.preventDefault();
            if (abierto && filtradas[marcado]) elegir(filtradas[marcado]);
          } else if (e.key === "Escape" && abierto) {
            e.stopPropagation();
            setAbierto(false);
          }
        }}
        placeholder={placeholder}
        className={`${CAMPO} pl-9`}
        role="combobox"
        aria-controls={idLista}
        aria-expanded={abierto}
        aria-autocomplete="list"
        aria-label="Buscar responsable"
      />
      {abierto && (
        <ul
          id={idLista}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-borde bg-superficie py-1 shadow-xl"
        >
          {filtradas.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-gris">Nadie con «{texto}».</li>
          ) : (
            filtradas.map((o, i) => (
              <li
                key={o.correo}
                role="option"
                aria-selected={i === marcado}
                // onMouseDown y no onClick: el clic llega antes de que el input pierda el foco y cierre la lista.
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(o);
                }}
                onMouseEnter={() => setMarcado(i)}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm ${i === marcado ? "bg-naranjo/[0.07]" : ""}`}
              >
                <Avatar nombre={o.nombre} correo={o.correo} chico />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-tinta">
                    {o.nombre}
                    {esYo(o.correo) && <span className="ml-1 font-normal text-gris">(tú)</span>}
                  </span>
                  <span className="block truncate text-[11px] text-gris">{o.correo}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
