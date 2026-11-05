"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowUp, IconAt, IconLoader2, IconSend2, IconSparkles, IconTrash, IconUsers } from "@tabler/icons-react";
import { LARGO_MAXIMO_MURO, trozosDe, type MensajeMuro, type PersonaMuro } from "@/lib/muro-modelo";
import { anterioresAction, borrarAction, nuevosAction, publicarAction } from "@/app/(protegido)/muro/acciones";

// El Muro como muro, no como chat: arriba se escribe, y las publicaciones van como tarjetas de la
// más nueva a la más vieja. Al costado, la gente de la empresa (tocar a alguien lo etiqueta).

const CADA_MS = 5000;
const COLORES = [
  "from-sky-400 to-blue-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-600",
  "from-rose-400 to-pink-600",
  "from-violet-400 to-purple-600",
  "from-cyan-400 to-sky-600",
  "from-lime-400 to-green-600",
  "from-fuchsia-400 to-violet-600",
];

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

function Avatar({ correo, nombre, tamano = "h-11 w-11 text-sm" }: { correo: string; nombre: string; tamano?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-linear-to-br font-bold text-white shadow-sm ring-2 ring-superficie ${colorDe(correo)} ${tamano}`} title={nombre}>
      {iniciales(nombre)}
    </span>
  );
}

/** «hace 5 min», «hace 3 h», «ayer 14:20», «3 nov 09:15». */
function cuando(iso: string): string {
  const t = Date.parse(iso);
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const dia = (d: number) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const h = new Date(t).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
  if (dia(t) === dia(Date.now())) return `hace ${Math.round(min / 60)} h`;
  if (dia(t) === dia(Date.now() - 86_400_000)) return `ayer ${h}`;
  return `${new Date(t).toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "America/Santiago" })} ${h}`;
}

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
  // Del más nuevo al más viejo.
  const [posts, setPosts] = useState<MensajeMuro[]>(() => [...inicial].reverse());
  const [pendientes, setPendientes] = useState<MensajeMuro[]>([]);
  const [hayMas, setHayMas] = useState(hayMasInicial);
  const [cargandoAntes, setCargandoAntes] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(aviso);
  const [sugerir, setSugerir] = useState<{ desde: number; busca: string } | null>(null);
  const [elegida, setElegida] = useState(0);
  const [, setReloj] = useState(0);
  const etiquetadas = useRef(new Map<string, string>());
  const caja = useRef<HTMLTextAreaElement>(null);

  const nombres = useMemo(() => new Map(personas.map((p) => [p.correo, p.nombre])), [personas]);
  const nombreDe = useCallback((c: string) => nombres.get(c) ?? c.split("@")[0], [nombres]);
  const candidatas = useMemo(() => {
    if (!sugerir) return [];
    const b = sinTildes(sugerir.busca);
    return personas.filter((p) => !b || sinTildes(p.nombre).split(/\s+/).some((x) => x.startsWith(b)) || sinTildes(p.correo).startsWith(b)).slice(0, 6);
  }, [sugerir, personas]);

  // Al llegar desde un aviso (/muro#m-<id>): a esa publicación, con un destello.
  useEffect(() => {
    const id = window.location.hash.startsWith("#m-") ? window.location.hash.slice(3) : null;
    const el = id ? document.getElementById(`m-${id}`) : null;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("ring-2", "ring-naranjo/60");
    setTimeout(() => el.classList.remove("ring-2", "ring-naranjo/60"), 2800);
  }, []);

  // Los «hace 5 min» se ponen al día solos.
  useEffect(() => {
    const t = setInterval(() => setReloj((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Publicaciones nuevas de otros: se juntan arriba en un aviso, para no mover lo que se está leyendo.
  const masNueva = pendientes[0]?.creadoEn ?? posts[0]?.creadoEn;
  const ids = useMemo(() => posts.map((m) => m.id), [posts]);
  useEffect(() => {
    let vivo = true;
    const tic = async () => {
      if (document.hidden) return;
      const r = await nuevosAction(masNueva ?? new Date(Date.now() - 60_000).toISOString(), ids).catch(() => null);
      if (!vivo || !r || !r.ok) return;
      if (r.empresaId !== empresa.id) return router.refresh();
      if (r.borrados.length) setPosts((xs) => xs.filter((m) => !r.borrados.includes(m.id)));
      const ajenos = r.nuevos.filter((m) => m.autorCorreo !== yo.correo);
      if (ajenos.length) setPendientes((xs) => [...[...ajenos].reverse().filter((m) => !xs.some((x) => x.id === m.id)), ...xs]);
    };
    const t = setInterval(tic, CADA_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [masNueva, ids, empresa.id, yo.correo, router]);

  function verNuevas() {
    setPosts((xs) => [...pendientes.filter((p) => !xs.some((x) => x.id === p.id)), ...xs]);
    setPendientes([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function verAnteriores() {
    const ultima = posts[posts.length - 1];
    if (!ultima) return;
    setCargandoAntes(true);
    const r = await anterioresAction(ultima.creadoEn);
    setCargandoAntes(false);
    if (!r.ok) return setError(r.error);
    setPosts((xs) => [...xs, ...[...r.mensajes].reverse()]);
    setHayMas(r.hayMas);
  }

  function cambiarTexto(valor: string, cursor: number) {
    setTexto(valor);
    setSugerir(mencionEnCurso(valor, cursor));
    setElegida(0);
  }

  function ponerCursor(pos: number) {
    requestAnimationFrame(() => {
      caja.current?.focus();
      caja.current?.setSelectionRange(pos, pos);
    });
  }

  function insertarArroba() {
    const pos = caja.current?.selectionStart ?? texto.length;
    const antes = texto.slice(0, pos);
    const espacio = antes && !/\s$/.test(antes) ? " " : "";
    cambiarTexto(`${antes}${espacio}@${texto.slice(pos)}`, pos + espacio.length + 1);
    ponerCursor(pos + espacio.length + 1);
  }

  /** Etiqueta a alguien: reemplaza el @ que se está escribiendo, o (desde la lista) lo agrega donde esté el cursor. */
  function etiquetar(p: PersonaMuro, desdeLista = false) {
    etiquetadas.current.set(p.nombre, p.correo);
    if (desdeLista || !sugerir) {
      const pos = caja.current?.selectionStart ?? texto.length;
      const antes = texto.slice(0, pos);
      const espacio = antes && !/\s$/.test(antes) ? " " : "";
      setTexto(`${antes}${espacio}@${p.nombre} ${texto.slice(pos)}`);
      setSugerir(null);
      return ponerCursor(antes.length + espacio.length + p.nombre.length + 2);
    }
    const antes = texto.slice(0, sugerir.desde);
    const despues = texto.slice(sugerir.desde + 1 + sugerir.busca.length).replace(/^\s/, "");
    setTexto(`${antes}@${p.nombre} ${despues}`);
    setSugerir(null);
    ponerCursor(antes.length + p.nombre.length + 2);
  }

  /** «@Alex Oliva» → «@{alex.oliva@pertec.cl}», solo las personas elegidas. */
  function paraGuardar(t: string): string {
    let salida = t;
    for (const [nombre, correo] of [...etiquetadas.current.entries()].sort((a, b) => b[0].length - a[0].length)) {
      salida = salida.split(`@${nombre}`).join(`@{${correo}}`);
    }
    return salida;
  }

  async function publicar() {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    setError(null);
    const r = await publicarAction(paraGuardar(limpio));
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    setTexto("");
    etiquetadas.current.clear();
    setPosts((xs) => [r.mensaje, ...pendientes.filter((p) => !xs.some((x) => x.id === p.id)), ...xs.filter((x) => x.id !== r.mensaje.id)]);
    setPendientes([]);
  }

  async function borrar(id: string) {
    if (!confirm("¿Borrar esta publicación? Desaparece para todos.")) return;
    const r = await borrarAction(id);
    if (!r.ok) return setError(r.error);
    setPosts((xs) => xs.filter((m) => m.id !== id));
  }

  function teclas(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (sugerir && candidatas.length) {
      if (e.key === "ArrowDown") return e.preventDefault(), setElegida((i) => (i + 1) % candidatas.length);
      if (e.key === "ArrowUp") return e.preventDefault(), setElegida((i) => (i - 1 + candidatas.length) % candidatas.length);
      if (e.key === "Enter" || e.key === "Tab") return e.preventDefault(), etiquetar(candidatas[elegida]);
      if (e.key === "Escape") return e.preventDefault(), setSugerir(null);
    }
    // En un muro se escribe con calma: Enter baja de línea; Ctrl/⌘ + Enter publica.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      publicar();
    }
  }

  useEffect(() => {
    const c = caja.current;
    if (!c) return;
    c.style.height = "auto";
    c.style.height = `${Math.min(Math.max(c.scrollHeight, 88), 260)}px`;
  }, [texto]);

  const primerNombre = yo.nombre.split(/\s+/)[0];
  const misMenciones = posts.filter((p) => p.menciones.includes(yo.correo) && p.autorCorreo !== yo.correo).length;

  return (
    <div className="space-y-5">
      {/* Portada */}
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-naranjo via-naranjo-suave to-amber-400 px-6 py-7 text-white shadow-[0_20px_50px_-20px_rgba(200,82,23,0.6)] sm:px-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/10" />
        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-white/80">Muro</p>
        <h1 className="relative mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{empresa.nombre}</h1>
        <p className="relative mt-1 max-w-xl text-sm text-white/85">Novedades, avisos y saludos de la gente de {empresa.nombre}. Escribe @ para etiquetar a alguien.</p>
        <div className="relative mt-4 flex items-center gap-3">
          <div className="flex -space-x-2">
            {personas.slice(0, 7).map((p) => (
              <Avatar key={p.correo} correo={p.correo} nombre={p.nombre} tamano="h-8 w-8 text-[10px]" />
            ))}
          </div>
          <span className="text-sm font-semibold text-white/90">{personas.length} {personas.length === 1 ? "persona" : "personas"}</span>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          {/* Escribir */}
          <section className="relative rounded-2xl border border-borde bg-superficie p-4 shadow-sm sm:p-5">
            <div className="flex gap-3">
              <Avatar correo={yo.correo} nombre={yo.nombre} />
              <div className="min-w-0 flex-1">
                <textarea
                  ref={caja}
                  value={texto}
                  onChange={(e) => cambiarTexto(e.target.value, e.target.selectionStart)}
                  onKeyDown={teclas}
                  onClick={(e) => setSugerir(mencionEnCurso(texto, e.currentTarget.selectionStart))}
                  onBlur={() => setTimeout(() => setSugerir(null), 120)}
                  maxLength={LARGO_MAXIMO_MURO}
                  placeholder={`¿Qué quieres compartir, ${primerNombre}?`}
                  className="w-full resize-none rounded-xl bg-tinta/[0.03] px-4 py-3 text-[15px] leading-relaxed text-tinta placeholder:text-gris-suave transition focus:bg-superficie focus:outline-none focus:ring-4 focus:ring-naranjo/10"
                />
                {sugerir && candidatas.length > 0 && (
                  <ul className="absolute left-16 right-4 z-20 mt-1 overflow-hidden rounded-xl border border-borde bg-superficie py-1 shadow-[0_18px_40px_-14px_rgba(23,20,17,0.35)] sm:right-auto sm:w-80">
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
                          <Avatar correo={p.correo} nombre={p.nombre} tamano="h-7 w-7 text-[10px]" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-tinta">{p.nombre}</span>
                            <span className="block truncate text-[11px] text-gris">{p.correo}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button type="button" onClick={insertarArroba} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-gris transition hover:bg-naranjo/10 hover:text-naranjo">
                    <IconAt size={18} /> Etiquetar
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="hidden text-[11px] text-gris-suave sm:inline">Ctrl + Enter para publicar</span>
                    <button
                      type="button"
                      onClick={publicar}
                      disabled={!texto.trim() || enviando}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-naranjo px-5 text-sm font-bold text-white shadow-sm transition hover:bg-naranjo-suave active:scale-[0.98] disabled:opacity-40"
                    >
                      {enviando ? <IconLoader2 size={18} className="animate-spin" /> : <IconSend2 size={18} />} Publicar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {pendientes.length > 0 && (
            <div className="sticky top-3 z-10 text-center">
              <button type="button" onClick={verNuevas} className="inline-flex items-center gap-1.5 rounded-full bg-naranjo px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-naranjo-suave">
                <IconArrowUp size={16} /> {pendientes.length === 1 ? "1 publicación nueva" : `${pendientes.length} publicaciones nuevas`}
              </button>
            </div>
          )}

          {/* Publicaciones */}
          {posts.length === 0 && !aviso && (
            <section className="rounded-2xl border border-dashed border-borde bg-superficie px-6 py-12 text-center">
              <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-naranjo/10 text-naranjo">
                <IconSparkles size={28} stroke={1.6} />
              </span>
              <p className="text-base font-bold text-tinta">El muro está vacío</p>
              <p className="mt-1 text-sm text-gris">Sé la primera persona en publicar algo arriba.</p>
            </section>
          )}
          <ol className="space-y-4">
            {posts.map((m) => {
              const meNombra = m.menciones.includes(yo.correo) && m.autorCorreo !== yo.correo;
              const puedeBorrar = m.autorCorreo === yo.correo || yo.admin;
              return (
                <li
                  key={m.id}
                  id={`m-${m.id}`}
                  className={`animar-entrada group relative rounded-2xl border bg-superficie p-5 shadow-sm transition hover:shadow-md ${meNombra ? "border-naranjo/40" : "border-borde"}`}
                >
                  {meNombra && <span className="absolute -top-2.5 left-5 rounded-full bg-naranjo px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">Te mencionaron</span>}
                  <header className="flex items-center gap-3">
                    <Avatar correo={m.autorCorreo} nombre={m.autorNombre} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-tinta">{m.autorNombre}</p>
                      <p className="text-xs text-gris" title={new Date(m.creadoEn).toLocaleString("es-CL", { timeZone: "America/Santiago" })}>
                        {cuando(m.creadoEn)}
                      </p>
                    </div>
                    {puedeBorrar && (
                      <button
                        type="button"
                        onClick={() => borrar(m.id)}
                        aria-label="Borrar publicación"
                        title="Borrar publicación"
                        className="grid h-8 w-8 place-items-center rounded-lg text-gris-suave opacity-0 transition hover:bg-rose-500/10 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100"
                      >
                        <IconTrash size={16} />
                      </button>
                    )}
                  </header>
                  <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-tinta">
                    {trozosDe(m.texto).map((t, j) =>
                      t.tipo === "texto" ? (
                        <span key={j}>{t.texto}</span>
                      ) : (
                        <span key={j} className={`rounded-md px-1.5 py-0.5 font-semibold ${t.correo === yo.correo ? "bg-naranjo/15 text-naranjo" : "bg-sky-500/10 text-sky-700 dark:text-sky-300"}`}>
                          @{nombreDe(t.correo)}
                        </span>
                      ),
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
          {hayMas && (
            <div className="text-center">
              <button type="button" onClick={verAnteriores} disabled={cargandoAntes} className="inline-flex items-center gap-1.5 rounded-full border border-borde bg-superficie px-4 py-2 text-sm font-semibold text-gris transition hover:text-tinta disabled:opacity-60">
                {cargandoAntes && <IconLoader2 size={16} className="animate-spin" />} Ver publicaciones anteriores
              </button>
            </div>
          )}
        </div>

        {/* Costado: la gente */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {misMenciones > 0 && (
            <div className="rounded-2xl border border-naranjo/30 bg-naranjo/[0.06] p-4">
              <p className="text-sm font-bold text-naranjo">{misMenciones === 1 ? "Te mencionaron 1 vez" : `Te mencionaron ${misMenciones} veces`}</p>
              <p className="mt-0.5 text-xs text-gris">Esas publicaciones tienen el borde naranjo.</p>
            </div>
          )}
          <section className="rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-tinta">
              <IconUsers size={17} className="text-naranjo" /> Gente de {empresa.nombre}
            </h2>
            <ul className="max-h-[26rem] space-y-0.5 overflow-y-auto">
              {personas.map((p) => (
                <li key={p.correo}>
                  <button
                    type="button"
                    onClick={() => etiquetar(p, true)}
                    title={`Etiquetar a ${p.nombre}`}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-naranjo/[0.07]"
                  >
                    <Avatar correo={p.correo} nombre={p.nombre} tamano="h-8 w-8 text-[10px]" />
                    <span className="min-w-0 flex-1 truncate text-sm text-tinta">{p.nombre}</span>
                    <IconAt size={15} className="text-gris-suave" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-gris-suave">Toca a alguien para etiquetarlo: le llega un aviso a su campana.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
