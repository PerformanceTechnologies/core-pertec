"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowDown, IconAt, IconLoader2, IconMessages, IconSend2, IconTrash } from "@tabler/icons-react";
import { LARGO_MAXIMO_MURO, trozosDe, type MensajeMuro, type PersonaMuro } from "@/lib/muro-modelo";
import { anterioresAction, borrarAction, nuevosAction, publicarAction } from "@/app/(protegido)/muro/acciones";

const CADA_MS = 4000;
const AGRUPAR_MS = 5 * 60 * 1000;
const COLORES = ["bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-teal-500", "bg-orange-500", "bg-indigo-500"];

function colorDe(correo: string): string {
  let h = 0;
  for (const c of correo) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
}

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
const dia = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

function etiquetaDia(clave: string): string {
  const hoy = dia(new Date().toISOString());
  const ayer = dia(new Date(Date.now() - 86_400_000).toISOString());
  if (clave === hoy) return "Hoy";
  if (clave === ayer) return "Ayer";
  return new Date(`${clave}T12:00:00Z`).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** La palabra que se está escribiendo con @ justo antes del cursor, si la hay. */
function mencionEnCurso(texto: string, cursor: number): { desde: number; busca: string } | null {
  const m = /(^|\s)@([\p{L}\p{N}._-]*)$/u.exec(texto.slice(0, cursor));
  return m ? { desde: cursor - m[2].length - 1, busca: m[2].toLowerCase() } : null;
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default function MuroChat({
  empresa,
  yo,
  personas,
  inicial,
  hayMas: hayMasInicial,
  aviso,
}: {
  empresa: { id: string; nombre: string };
  yo: { correo: string; nombre: string; admin: boolean };
  personas: PersonaMuro[];
  inicial: MensajeMuro[];
  hayMas: boolean;
  aviso: string | null;
}) {
  const router = useRouter();
  const [mensajes, setMensajes] = useState<MensajeMuro[]>(inicial);
  const [hayMas, setHayMas] = useState(hayMasInicial);
  const [cargandoAntes, setCargandoAntes] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(aviso);
  const [nuevosAbajo, setNuevosAbajo] = useState(0);
  // Autocompletar de @: qué se busca, dónde empieza y cuál está elegida con las flechas.
  const [sugerir, setSugerir] = useState<{ desde: number; busca: string } | null>(null);
  const [elegida, setElegida] = useState(0);
  // Nombre visible en la caja → correo, de las personas etiquetadas con el autocompletar.
  const etiquetadas = useRef(new Map<string, string>());
  const lista = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);

  const nombres = useMemo(() => new Map(personas.map((p) => [p.correo, p.nombre])), [personas]);
  const nombreDe = useCallback((c: string) => nombres.get(c) ?? c.split("@")[0], [nombres]);

  const candidatas = useMemo(() => {
    if (!sugerir) return [];
    const b = sinTildes(sugerir.busca);
    return personas.filter((p) => !b || sinTildes(p.nombre).split(/\s+/).some((x) => x.startsWith(b)) || sinTildes(p.correo).startsWith(b)).slice(0, 6);
  }, [sugerir, personas]);

  const cercaDelFondo = () => {
    const l = lista.current;
    return !l || l.scrollHeight - l.scrollTop - l.clientHeight < 120;
  };
  const alFondo = (suave = true) => {
    const l = lista.current;
    if (l) l.scrollTo({ top: l.scrollHeight, behavior: suave ? "smooth" : "auto" });
    setNuevosAbajo(0);
  };

  // Al entrar: al fondo, o al mensaje del aviso (/muro#m-<id>).
  useEffect(() => {
    const id = window.location.hash.startsWith("#m-") ? window.location.hash.slice(3) : null;
    const el = id ? document.getElementById(`m-${id}`) : null;
    if (el) {
      el.scrollIntoView({ block: "center" });
      // Se resalta un momento directo en el DOM: es solo un destello, no estado de la pantalla.
      el.classList.add("ring-2", "ring-naranjo/50");
      setTimeout(() => el.classList.remove("ring-2", "ring-naranjo/50"), 2500);
    } else if (lista.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, []);

  // Lo nuevo llega solo: se pregunta cada pocos segundos mientras la pestaña está a la vista.
  const ultimo = mensajes[mensajes.length - 1]?.creadoEn;
  const ids = useMemo(() => mensajes.map((m) => m.id), [mensajes]);
  useEffect(() => {
    let vivo = true;
    const tic = async () => {
      if (document.hidden) return;
      const r = await nuevosAction(ultimo ?? new Date(Date.now() - 60_000).toISOString(), ids).catch(() => null);
      if (!vivo || !r || !r.ok) return;
      if (r.empresaId !== empresa.id) return router.refresh(); // cambió la empresa activa en otra pestaña
      if (!r.nuevos.length && !r.borrados.length) return;
      const abajo = cercaDelFondo();
      setMensajes((xs) => {
        const ya = new Set(xs.map((m) => m.id));
        return [...xs.filter((m) => !r.borrados.includes(m.id)), ...r.nuevos.filter((m) => !ya.has(m.id))];
      });
      const ajenos = r.nuevos.filter((m) => m.autorCorreo !== yo.correo).length;
      if (abajo) setTimeout(() => alFondo(), 30);
      else if (ajenos) setNuevosAbajo((n) => n + ajenos);
    };
    const t = setInterval(tic, CADA_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [ultimo, ids, empresa.id, yo.correo, router]);

  async function verAnteriores() {
    const primero = mensajes[0];
    if (!primero) return;
    setCargandoAntes(true);
    const l = lista.current;
    const alto = l?.scrollHeight ?? 0;
    const r = await anterioresAction(primero.creadoEn);
    setCargandoAntes(false);
    if (!r.ok) return setError(r.error);
    setMensajes((xs) => [...r.mensajes, ...xs]);
    setHayMas(r.hayMas);
    // Que la pantalla no salte: se queda mirando el mismo mensaje.
    requestAnimationFrame(() => {
      if (l) l.scrollTop += l.scrollHeight - alto;
    });
  }

  function cambiarTexto(valor: string, cursor: number) {
    setTexto(valor);
    const m = mencionEnCurso(valor, cursor);
    setSugerir(m);
    setElegida(0);
  }

  function etiquetar(p: PersonaMuro) {
    if (!sugerir) return;
    const antes = texto.slice(0, sugerir.desde);
    const despues = texto.slice(sugerir.desde + 1 + sugerir.busca.length);
    const nuevo = `${antes}@${p.nombre} ${despues.replace(/^\s/, "")}`;
    etiquetadas.current.set(p.nombre, p.correo);
    setTexto(nuevo);
    setSugerir(null);
    const pos = antes.length + p.nombre.length + 2;
    requestAnimationFrame(() => {
      caja.current?.focus();
      caja.current?.setSelectionRange(pos, pos);
    });
  }

  /** «@Alex Oliva» → «@{alex.oliva@pertec.cl}», solo las personas elegidas del autocompletar. */
  function paraGuardar(t: string): string {
    const elegidas = [...etiquetadas.current.entries()].sort((a, b) => b[0].length - a[0].length);
    let salida = t;
    for (const [nombre, correo] of elegidas) salida = salida.split(`@${nombre}`).join(`@{${correo}}`);
    return salida;
  }

  async function enviar() {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    setError(null);
    const r = await publicarAction(paraGuardar(limpio));
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    setTexto("");
    etiquetadas.current.clear();
    setMensajes((xs) => (xs.some((m) => m.id === r.mensaje.id) ? xs : [...xs, r.mensaje]));
    setTimeout(() => alFondo(), 30);
    caja.current?.focus();
  }

  async function borrar(id: string) {
    if (!confirm("¿Borrar este mensaje? Desaparece para todos.")) return;
    const r = await borrarAction(id);
    if (!r.ok) return setError(r.error);
    setMensajes((xs) => xs.filter((m) => m.id !== id));
  }

  function teclas(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (sugerir && candidatas.length) {
      if (e.key === "ArrowDown") return e.preventDefault(), setElegida((i) => (i + 1) % candidatas.length);
      if (e.key === "ArrowUp") return e.preventDefault(), setElegida((i) => (i - 1 + candidatas.length) % candidatas.length);
      if (e.key === "Enter" || e.key === "Tab") return e.preventDefault(), etiquetar(candidatas[elegida]);
      if (e.key === "Escape") return e.preventDefault(), setSugerir(null);
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar();
    }
  }

  // La caja crece con el texto, hasta seis líneas.
  useEffect(() => {
    const c = caja.current;
    if (!c) return;
    c.style.height = "auto";
    c.style.height = `${Math.min(c.scrollHeight, 160)}px`;
  }, [texto]);

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-borde bg-superficie shadow-sm">
      {/* Encabezado */}
      <header className="flex items-center gap-3 border-b border-borde px-5 py-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-naranjo to-naranjo-suave text-white shadow-sm">
          <IconMessages size={20} stroke={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold tracking-tight text-tinta">Muro de {empresa.nombre}</h1>
          <p className="truncate text-sm text-gris">Habla con la gente de {empresa.nombre}. Escribe <b className="font-semibold text-tinta">@</b> para etiquetar a alguien.</p>
        </div>
        <span className="hidden shrink-0 rounded-full bg-tinta/[0.05] px-3 py-1 text-xs font-semibold text-gris sm:inline">{personas.length} personas</span>
      </header>

      {/* Mensajes */}
      <div ref={lista} className="relative min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        {hayMas && (
          <div className="mb-3 text-center">
            <button type="button" onClick={verAnteriores} disabled={cargandoAntes} className="inline-flex items-center gap-1.5 rounded-full border border-borde px-3 py-1.5 text-xs font-semibold text-gris transition hover:text-tinta disabled:opacity-60">
              {cargandoAntes && <IconLoader2 size={14} className="animate-spin" />} Ver mensajes anteriores
            </button>
          </div>
        )}
        {mensajes.length === 0 && !aviso && (
          <div className="grid h-full place-items-center text-center">
            <div className="max-w-xs">
              <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-naranjo/10 text-naranjo">
                <IconMessages size={28} stroke={1.6} />
              </span>
              <p className="font-bold text-tinta">Todavía no hay mensajes</p>
              <p className="mt-1 text-sm text-gris">Escribe el primero abajo. Para avisarle a alguien, escribe @ y su nombre.</p>
            </div>
          </div>
        )}
        <ol className="space-y-0.5">
          {mensajes.map((m, i) => {
            const previo = mensajes[i - 1];
            const nuevoDia = !previo || dia(previo.creadoEn) !== dia(m.creadoEn);
            const seguido = !nuevoDia && previo.autorCorreo === m.autorCorreo && Date.parse(m.creadoEn) - Date.parse(previo.creadoEn) < AGRUPAR_MS;
            const meNombra = m.menciones.includes(yo.correo) && m.autorCorreo !== yo.correo;
            const mio = m.autorCorreo === yo.correo;
            return (
              <li key={m.id}>
                {nuevoDia && (
                  <div className="my-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-gris-suave">
                    <span className="h-px flex-1 bg-borde" />
                    {etiquetaDia(dia(m.creadoEn))}
                    <span className="h-px flex-1 bg-borde" />
                  </div>
                )}
                <div
                  id={`m-${m.id}`}
                  className={`group relative flex gap-3 rounded-xl px-2 transition ${seguido ? "py-0.5" : "mt-2 py-1.5"} ${
                    meNombra ? "bg-naranjo/[0.06] hover:bg-naranjo/10" : "hover:bg-tinta/[0.03]"
                  }`}
                >
                  <div className="w-9 shrink-0">
                    {!seguido && (
                      <span className={`grid h-9 w-9 place-items-center rounded-full text-xs font-bold text-white ${colorDe(m.autorCorreo)}`} title={m.autorCorreo}>
                        {iniciales(m.autorNombre)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {!seguido && (
                      <p className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-tinta">{m.autorNombre}</span>
                        <span className="text-[11px] text-gris-suave">{hora(m.creadoEn)}</span>
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-tinta">
                      {trozosDe(m.texto).map((t, j) =>
                        t.tipo === "texto" ? (
                          <span key={j}>{t.texto}</span>
                        ) : (
                          <span key={j} className={`rounded-md px-1 py-0.5 font-semibold ${t.correo === yo.correo ? "bg-naranjo/20 text-naranjo" : "bg-cian/10 text-azul"}`}>
                            @{nombreDe(t.correo)}
                          </span>
                        ),
                      )}
                    </p>
                  </div>
                  {seguido && <span className="hidden shrink-0 self-center text-[10px] text-gris-suave group-hover:inline">{hora(m.creadoEn)}</span>}
                  {(mio || yo.admin) && (
                    <button
                      type="button"
                      onClick={() => borrar(m.id)}
                      aria-label="Borrar mensaje"
                      title="Borrar mensaje"
                      className="absolute right-2 top-1.5 hidden h-7 w-7 place-items-center rounded-lg bg-superficie text-gris shadow-sm ring-1 ring-borde transition hover:text-rose-600 group-hover:grid"
                    >
                      <IconTrash size={14} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {nuevosAbajo > 0 && (
        <div className="pointer-events-none relative">
          <button
            type="button"
            onClick={() => alFondo()}
            className="pointer-events-auto absolute -top-12 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-naranjo px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg"
          >
            <IconArrowDown size={14} /> {nuevosAbajo === 1 ? "1 mensaje nuevo" : `${nuevosAbajo} mensajes nuevos`}
          </button>
        </div>
      )}

      {/* Escribir */}
      <div className="relative border-t border-borde px-3 py-3 sm:px-5">
        {sugerir && candidatas.length > 0 && (
          <ul className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-xl border border-borde bg-superficie py-1 shadow-[0_18px_40px_-14px_rgba(23,20,17,0.35)] sm:left-5 sm:right-auto sm:w-80">
            <li className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gris-suave">Etiquetar a</li>
            {candidatas.map((p, i) => (
              <li key={p.correo}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    etiquetar(p);
                  }}
                  onMouseEnter={() => setElegida(i)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${i === elegida ? "bg-naranjo/10" : ""}`}
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${colorDe(p.correo)}`}>{iniciales(p.nombre)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-tinta">{p.nombre}</span>
                    <span className="block truncate text-[11px] text-gris">{p.correo}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        <div className="flex items-end gap-2 rounded-2xl border border-borde bg-tinta/[0.03] p-1.5 transition focus-within:border-cian/60 focus-within:bg-superficie focus-within:ring-4 focus-within:ring-cian/15">
          <button
            type="button"
            onClick={() => {
              const c = caja.current;
              const pos = c?.selectionStart ?? texto.length;
              const antes = texto.slice(0, pos);
              const espacio = antes && !/\s$/.test(antes) ? " " : "";
              cambiarTexto(`${antes}${espacio}@${texto.slice(pos)}`, pos + espacio.length + 1);
              requestAnimationFrame(() => {
                c?.focus();
                c?.setSelectionRange(pos + espacio.length + 1, pos + espacio.length + 1);
              });
            }}
            aria-label="Etiquetar a alguien"
            title="Etiquetar a alguien"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-gris transition hover:bg-tinta/[0.06] hover:text-naranjo"
          >
            <IconAt size={20} stroke={1.8} />
          </button>
          <textarea
            ref={caja}
            value={texto}
            onChange={(e) => cambiarTexto(e.target.value, e.target.selectionStart)}
            onKeyDown={teclas}
            onClick={(e) => setSugerir(mencionEnCurso(texto, e.currentTarget.selectionStart))}
            onBlur={() => setTimeout(() => setSugerir(null), 120)}
            rows={1}
            maxLength={LARGO_MAXIMO_MURO}
            placeholder={`Escribe a ${empresa.nombre}…  (Enter envía, Shift+Enter baja de línea)`}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] text-tinta placeholder:text-gris-suave focus:outline-none"
          />
          <button
            type="button"
            onClick={enviar}
            disabled={!texto.trim() || enviando}
            aria-label="Enviar"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-naranjo px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-naranjo-suave active:scale-[0.98] disabled:opacity-40"
          >
            {enviando ? <IconLoader2 size={18} className="animate-spin" /> : <IconSend2 size={18} />}
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
