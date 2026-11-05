"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowUp, IconAt, IconLoader2, IconMessageCircle, IconSparkles, IconTrash, IconUsers } from "@tabler/icons-react";
import { trozosDe, type MensajeMuro, type PersonaMuro } from "@/lib/muro-modelo";
import { anterioresAction, borrarAction, nuevosAction, publicarAction } from "@/app/(protegido)/muro/acciones";
import { Avatar } from "./Avatar";
import Compositor, { type ManejoCompositor } from "./Compositor";

// El Muro como muro, no como chat: arriba se escribe, las publicaciones van como tarjetas de la
// más nueva a la más vieja y cada una tiene sus respuestas debajo. Al costado, la gente de la
// empresa (tocar a alguien lo etiqueta en lo que se está escribiendo).

const CADA_MS = 5000;

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

/** Agrupa respuestas por publicación, sin repetir, de la más vieja a la más nueva. */
function agrupar(base: Record<string, MensajeMuro[]>, nuevas: MensajeMuro[]): Record<string, MensajeMuro[]> {
  const salida = { ...base };
  for (const r of nuevas) {
    if (!r.respuestaA) continue;
    const lista = salida[r.respuestaA] ?? [];
    if (!lista.some((x) => x.id === r.id)) salida[r.respuestaA] = [...lista, r].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  }
  return salida;
}

export default function MuroChat({
  empresa,
  yo,
  personas,
  inicial,
  respuestasIniciales,
  hayMas: hayMasInicial,
  aviso,
}: {
  empresa: { id: string; nombre: string };
  yo: { correo: string; nombre: string; admin: boolean };
  personas: PersonaMuro[];
  inicial: MensajeMuro[];
  respuestasIniciales: MensajeMuro[];
  hayMas: boolean;
  aviso: string | null;
}) {
  const router = useRouter();
  // Publicaciones, de la más nueva a la más vieja.
  const [posts, setPosts] = useState<MensajeMuro[]>(() => [...inicial].reverse());
  const [respuestas, setRespuestas] = useState<Record<string, MensajeMuro[]>>(() => agrupar({}, respuestasIniciales));
  const [pendientes, setPendientes] = useState<MensajeMuro[]>([]);
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [hayMas, setHayMas] = useState(hayMasInicial);
  const [cargandoAntes, setCargandoAntes] = useState(false);
  const [error, setError] = useState<string | null>(aviso);
  const [, setReloj] = useState(0);
  const principal = useRef<ManejoCompositor>(null);
  const respuesta = useRef<ManejoCompositor>(null);

  const nombres = useMemo(() => new Map(personas.map((p) => [p.correo, p.nombre])), [personas]);
  const nombreDe = useCallback((c: string) => nombres.get(c) ?? c.split("@")[0], [nombres]);

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

  // Lo nuevo de otros: las respuestas se suman al tiro bajo su publicación; las publicaciones
  // nuevas esperan en un aviso arriba, para no mover lo que se está leyendo.
  const todas = useMemo(() => [...pendientes, ...posts, ...Object.values(respuestas).flat()], [pendientes, posts, respuestas]);
  const masNueva = useMemo(() => todas.reduce<string | undefined>((m, x) => (!m || x.creadoEn > m ? x.creadoEn : m), undefined), [todas]);
  const ids = useMemo(() => todas.map((m) => m.id), [todas]);
  useEffect(() => {
    let vivo = true;
    const tic = async () => {
      if (document.hidden) return;
      const r = await nuevosAction(masNueva ?? new Date(Date.now() - 60_000).toISOString(), ids).catch(() => null);
      if (!vivo || !r || !r.ok) return;
      if (r.empresaId !== empresa.id) return router.refresh();
      if (r.borrados.length) {
        setPosts((xs) => xs.filter((m) => !r.borrados.includes(m.id)));
        setRespuestas((rs) => Object.fromEntries(Object.entries(rs).map(([k, v]) => [k, v.filter((m) => !r.borrados.includes(m.id))])));
      }
      const ajenos = r.nuevos.filter((m) => m.autorCorreo !== yo.correo);
      const nuevasRespuestas = ajenos.filter((m) => m.respuestaA);
      const nuevosPosts = ajenos.filter((m) => !m.respuestaA);
      if (nuevasRespuestas.length) setRespuestas((rs) => agrupar(rs, nuevasRespuestas));
      if (nuevosPosts.length) setPendientes((xs) => [...[...nuevosPosts].reverse().filter((m) => !xs.some((x) => x.id === m.id)), ...xs]);
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
    setRespuestas((rs) => agrupar(rs, r.respuestas));
    setHayMas(r.hayMas);
  }

  async function publicar(texto: string): Promise<string | null> {
    const r = await publicarAction(texto);
    if (!r.ok) return r.error;
    setPosts((xs) => [r.mensaje, ...pendientes.filter((p) => !xs.some((x) => x.id === p.id)), ...xs.filter((x) => x.id !== r.mensaje.id)]);
    setPendientes([]);
    return null;
  }

  async function responder(publicacion: string, texto: string): Promise<string | null> {
    const r = await publicarAction(texto, publicacion);
    if (!r.ok) return r.error;
    setRespuestas((rs) => agrupar(rs, [r.mensaje]));
    setRespondiendo(null);
    return null;
  }

  async function borrar(m: MensajeMuro) {
    if (!confirm(m.respuestaA ? "¿Borrar esta respuesta?" : "¿Borrar esta publicación? Se borran también sus respuestas.")) return;
    const r = await borrarAction(m.id);
    if (!r.ok) return setError(r.error);
    if (m.respuestaA) setRespuestas((rs) => ({ ...rs, [m.respuestaA!]: (rs[m.respuestaA!] ?? []).filter((x) => x.id !== m.id) }));
    else setPosts((xs) => xs.filter((x) => x.id !== m.id));
  }

  function Texto({ m, chico = false }: { m: MensajeMuro; chico?: boolean }) {
    return (
      <p className={`whitespace-pre-wrap break-words text-tinta ${chico ? "text-sm leading-relaxed" : "mt-3 text-[15px] leading-relaxed"}`}>
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
    );
  }

  function BotonBorrar({ m }: { m: MensajeMuro }) {
    if (m.autorCorreo !== yo.correo && !yo.admin) return null;
    return (
      <button
        type="button"
        onClick={() => borrar(m)}
        aria-label={m.respuestaA ? "Borrar respuesta" : "Borrar publicación"}
        title={m.respuestaA ? "Borrar respuesta" : "Borrar publicación"}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-gris-suave opacity-0 transition hover:bg-rose-500/10 hover:text-rose-600 focus:opacity-100 group-hover/item:opacity-100"
      >
        <IconTrash size={15} />
      </button>
    );
  }

  const primerNombre = yo.nombre.split(/\s+/)[0];
  const meNombran = (m: MensajeMuro) => m.menciones.includes(yo.correo) && m.autorCorreo !== yo.correo;
  const misMenciones = posts.filter((p) => meNombran(p) || (respuestas[p.id] ?? []).some(meNombran)).length;

  return (
    <div className="space-y-5">
      {/* Portada */}
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-naranjo via-naranjo-suave to-amber-400 px-6 py-7 text-white shadow-[0_20px_50px_-20px_rgba(200,82,23,0.6)] sm:px-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/10" />
        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-white/80">Muro</p>
        <h1 className="relative mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{empresa.nombre}</h1>
        <p className="relative mt-1 max-w-xl text-sm text-white/85">Novedades, avisos y saludos de la gente de {empresa.nombre}. Responde las publicaciones y escribe @ para etiquetar a alguien.</p>
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
          <section className="rounded-2xl border border-borde bg-superficie p-4 shadow-sm sm:p-5">
            <Compositor ref={principal} yo={yo} personas={personas} placeholder={`¿Qué quieres compartir, ${primerNombre}?`} boton="Publicar" alPublicar={publicar} />
          </section>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

          {pendientes.length > 0 && (
            <div className="sticky top-3 z-10 text-center">
              <button type="button" onClick={verNuevas} className="inline-flex items-center gap-1.5 rounded-full bg-naranjo px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-naranjo-suave">
                <IconArrowUp size={16} /> {pendientes.length === 1 ? "1 publicación nueva" : `${pendientes.length} publicaciones nuevas`}
              </button>
            </div>
          )}

          {posts.length === 0 && !aviso && (
            <section className="rounded-2xl border border-dashed border-borde bg-superficie px-6 py-12 text-center">
              <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-naranjo/10 text-naranjo">
                <IconSparkles size={28} stroke={1.6} />
              </span>
              <p className="text-base font-bold text-tinta">El muro está vacío</p>
              <p className="mt-1 text-sm text-gris">Sé la primera persona en publicar algo arriba.</p>
            </section>
          )}

          {/* Publicaciones */}
          <ol className="space-y-4">
            {posts.map((m) => {
              const lista = respuestas[m.id] ?? [];
              return (
                <li
                  key={m.id}
                  id={`m-${m.id}`}
                  className={`animar-entrada relative rounded-2xl border bg-superficie shadow-sm transition hover:shadow-md ${meNombran(m) ? "border-naranjo/40" : "border-borde"}`}
                >
                  {meNombran(m) && <span className="absolute -top-2.5 left-5 rounded-full bg-naranjo px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">Te mencionaron</span>}
                  <div className="group/item p-5 pb-3">
                    <header className="flex items-center gap-3">
                      <Avatar correo={m.autorCorreo} nombre={m.autorNombre} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold text-tinta">{m.autorNombre}</p>
                        <p className="text-xs text-gris" title={new Date(m.creadoEn).toLocaleString("es-CL", { timeZone: "America/Santiago" })}>
                          {cuando(m.creadoEn)}
                        </p>
                      </div>
                      <BotonBorrar m={m} />
                    </header>
                    <Texto m={m} />
                    <div className="mt-3 flex items-center gap-1 border-t border-borde/70 pt-2">
                      <button
                        type="button"
                        onClick={() => setRespondiendo(respondiendo === m.id ? null : m.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition ${respondiendo === m.id ? "bg-naranjo/10 text-naranjo" : "text-gris hover:bg-naranjo/10 hover:text-naranjo"}`}
                      >
                        <IconMessageCircle size={17} /> Responder
                      </button>
                      {lista.length > 0 && (
                        <span className="text-xs text-gris-suave">· {lista.length === 1 ? "1 respuesta" : `${lista.length} respuestas`}</span>
                      )}
                    </div>
                  </div>

                  {(lista.length > 0 || respondiendo === m.id) && (
                    <div className="space-y-3 rounded-b-2xl border-t border-borde/70 bg-tinta/[0.02] px-5 py-4">
                      {lista.map((r) => (
                        <div key={r.id} id={`m-${r.id}`} className={`group/item flex gap-2.5 rounded-xl ${meNombran(r) ? "bg-naranjo/[0.06] p-2 -m-2" : ""}`}>
                          <Avatar correo={r.autorCorreo} nombre={r.autorNombre} tamano="h-8 w-8 text-[10px]" />
                          <div className="min-w-0 flex-1">
                            <div className="rounded-2xl rounded-tl-md bg-superficie px-3.5 py-2.5 shadow-[0_1px_2px_rgba(23,20,17,0.06)] ring-1 ring-borde/70">
                              <p className="flex items-baseline gap-2">
                                <span className="text-sm font-bold text-tinta">{r.autorNombre}</span>
                                <span className="text-[11px] text-gris-suave">{cuando(r.creadoEn)}</span>
                              </p>
                              <Texto m={r} chico />
                            </div>
                          </div>
                          <BotonBorrar m={r} />
                        </div>
                      ))}
                      {respondiendo === m.id ? (
                        <Compositor
                          ref={respuesta}
                          yo={yo}
                          personas={personas}
                          placeholder={`Responder a ${m.autorNombre.split(/\s+/)[0]}…`}
                          boton="Responder"
                          compacto
                          autoFocus
                          alPublicar={(t) => responder(m.id, t)}
                          alCancelar={() => setRespondiendo(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRespondiendo(m.id)}
                          className="flex w-full items-center gap-2.5 rounded-xl px-1 py-1 text-left text-sm text-gris-suave transition hover:text-gris"
                        >
                          <Avatar correo={yo.correo} nombre={yo.nombre} tamano="h-8 w-8 text-[10px]" />
                          <span className="flex-1 rounded-full bg-tinta/[0.04] px-4 py-2">Escribe una respuesta…</span>
                        </button>
                      )}
                    </div>
                  )}
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
              <p className="text-sm font-bold text-naranjo">{misMenciones === 1 ? "Te mencionaron en 1 publicación" : `Te mencionaron en ${misMenciones} publicaciones`}</p>
              <p className="mt-0.5 text-xs text-gris">Están marcadas en naranjo.</p>
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
                    onClick={() => (respondiendo ? respuesta.current : principal.current)?.etiquetar(p)}
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
            <p className="mt-3 text-[11px] text-gris-suave">Toca a alguien para etiquetarlo en lo que estás escribiendo: le llega un aviso a su campana.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
