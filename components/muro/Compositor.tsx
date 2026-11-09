"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { IconAt, IconLoader2, IconSend2, IconUsersGroup } from "@tabler/icons-react";
import { LARGO_MAXIMO_MURO, TODOS, type PersonaMuro } from "@/lib/muro-modelo";
import { Avatar } from "./Avatar";

// La caja para escribir del Muro, para publicaciones y para respuestas: crece con el texto,
// etiqueta con @ (lista de sugerencias con flechas y Enter) y publica con el botón o Ctrl+Enter.

export interface ManejoCompositor {
  /** Etiqueta a alguien donde esté el cursor (desde la lista de gente del costado). */
  etiquetar: (p: PersonaMuro) => void;
  enfocar: () => void;
}

function mencionEnCurso(texto: string, cursor: number): { desde: number; busca: string } | null {
  const m = /(^|\s)@([\p{L}\p{N}._-]*)$/u.exec(texto.slice(0, cursor));
  return m ? { desde: cursor - m[2].length - 1, busca: m[2].toLowerCase() } : null;
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default function Compositor({
  ref,
  yo,
  personas,
  placeholder,
  boton,
  compacto = false,
  autoFocus = false,
  alPublicar,
  alCancelar,
}: {
  ref?: Ref<ManejoCompositor>;
  yo: { correo: string; nombre: string };
  personas: PersonaMuro[];
  placeholder: string;
  boton: string;
  compacto?: boolean;
  autoFocus?: boolean;
  /** Publica el texto (con las menciones ya como @{correo}). Devuelve el error, o null si salió bien. */
  alPublicar: (texto: string) => Promise<string | null>;
  alCancelar?: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sugerir, setSugerir] = useState<{ desde: number; busca: string } | null>(null);
  const [elegida, setElegida] = useState(0);
  // Nombre visible en la caja → correo, de las personas etiquetadas.
  const etiquetadas = useRef(new Map<string, string>());
  const caja = useRef<HTMLTextAreaElement>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  const candidatas = useMemo(() => {
    if (!sugerir) return [];
    const b = sinTildes(sugerir.busca);
    // «Todos» va primero: menciona a toda la empresa.
    const todos: PersonaMuro[] = !b || TODOS.startsWith(b) ? [{ correo: TODOS, nombre: "todos" }] : [];
    return [...todos, ...personas.filter((p) => !b || sinTildes(p.nombre).split(/\s+/).some((x) => x.startsWith(b)) || sinTildes(p.correo).startsWith(b))].slice(0, 7);
  }, [sugerir, personas]);

  function ponerCursor(pos: number) {
    requestAnimationFrame(() => {
      caja.current?.focus();
      caja.current?.setSelectionRange(pos, pos);
    });
  }

  function cambiarTexto(valor: string, cursor: number) {
    setTexto(valor);
    setSugerir(mencionEnCurso(valor, cursor));
    setElegida(0);
  }

  function etiquetar(p: PersonaMuro, enCurso = sugerir) {
    etiquetadas.current.set(p.nombre, p.correo);
    if (!enCurso) {
      const pos = caja.current?.selectionStart ?? texto.length;
      const antes = texto.slice(0, pos);
      const espacio = antes && !/\s$/.test(antes) ? " " : "";
      setTexto(`${antes}${espacio}@${p.nombre} ${texto.slice(pos)}`);
      return ponerCursor(antes.length + espacio.length + p.nombre.length + 2);
    }
    const antes = texto.slice(0, enCurso.desde);
    const despues = texto.slice(enCurso.desde + 1 + enCurso.busca.length).replace(/^\s/, "");
    setTexto(`${antes}@${p.nombre} ${despues}`);
    setSugerir(null);
    ponerCursor(antes.length + p.nombre.length + 2);
  }

  useImperativeHandle(ref, () => ({ etiquetar: (p) => etiquetar(p, null), enfocar: () => caja.current?.focus() }));

  function insertarArroba() {
    const pos = caja.current?.selectionStart ?? texto.length;
    const antes = texto.slice(0, pos);
    const espacio = antes && !/\s$/.test(antes) ? " " : "";
    cambiarTexto(`${antes}${espacio}@${texto.slice(pos)}`, pos + espacio.length + 1);
    ponerCursor(pos + espacio.length + 1);
  }

  async function publicar() {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    let salida = limpio;
    for (const [nombre, correo] of [...etiquetadas.current.entries()].sort((a, b) => b[0].length - a[0].length)) {
      salida = salida.split(`@${nombre}`).join(`@{${correo}}`);
    }
    // «@todos» escrito a mano también cuenta, sin tener que elegirlo de la lista.
    salida = salida.replace(/(^|\s)@todos(?![\p{L}\p{N}_])/giu, `$1@{${TODOS}}`);
    setEnviando(true);
    setError(null);
    const fallo = await alPublicar(salida);
    setEnviando(false);
    if (fallo) return setError(fallo);
    setTexto("");
    etiquetadas.current.clear();
  }

  function teclas(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (sugerir && candidatas.length) {
      if (e.key === "ArrowDown") return e.preventDefault(), setElegida((i) => (i + 1) % candidatas.length);
      if (e.key === "ArrowUp") return e.preventDefault(), setElegida((i) => (i - 1 + candidatas.length) % candidatas.length);
      if (e.key === "Enter" || e.key === "Tab") return e.preventDefault(), etiquetar(candidatas[elegida]);
      if (e.key === "Escape") return e.preventDefault(), setSugerir(null);
    }
    if (e.key === "Escape" && alCancelar && !texto) return alCancelar();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      publicar();
    }
  }

  useEffect(() => {
    const c = caja.current;
    if (!c) return;
    c.style.height = "auto";
    c.style.height = `${Math.min(Math.max(c.scrollHeight, compacto ? 44 : 88), 260)}px`;
  }, [texto, compacto]);

  return (
    <div ref={contenedor} className="relative flex gap-3">
      <Avatar correo={yo.correo} nombre={yo.nombre} tamano={compacto ? "h-8 w-8 text-[10px]" : "h-11 w-11 text-sm"} />
      <div className="min-w-0 flex-1">
        <textarea
          ref={caja}
          value={texto}
          autoFocus={autoFocus}
          onChange={(e) => cambiarTexto(e.target.value, e.target.selectionStart)}
          onKeyDown={teclas}
          onClick={(e) => setSugerir(mencionEnCurso(texto, e.currentTarget.selectionStart))}
          // La lista se cierra solo si el foco se va FUERA de la caja de escribir (los botones de
          // adentro no se lo quitan: ver onMouseDown). Sin temporizadores que la cierren a destiempo.
          onBlur={(e) => {
            if (!contenedor.current?.contains(e.relatedTarget as Node | null)) setSugerir(null);
          }}
          maxLength={LARGO_MAXIMO_MURO}
          placeholder={placeholder}
          className={`w-full resize-none rounded-xl bg-tinta/[0.03] text-tinta placeholder:text-gris-suave transition focus:bg-superficie focus:outline-none focus:ring-4 focus:ring-naranjo/10 ${
            compacto ? "px-3 py-2.5 text-sm" : "px-4 py-3 text-[15px] leading-relaxed"
          }`}
        />
        {error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        <div className={`flex items-center justify-between gap-2 ${compacto ? "mt-2" : "mt-3"}`}>
          <button
            type="button"
            // Sin robarle el foco a la caja: si no, la lista de personas se cierra apenas se abre.
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertarArroba}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-gris transition hover:bg-naranjo/10 hover:text-naranjo">
            <IconAt size={compacto ? 16 : 18} /> Etiquetar
          </button>
          <div className="flex items-center gap-2">
            {!compacto && <span className="hidden text-[11px] text-gris-suave sm:inline">Ctrl + Enter para publicar</span>}
            {alCancelar && (
              <button type="button" onClick={alCancelar} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-gris transition hover:text-tinta">
                Cancelar
              </button>
            )}
            <button
              type="button"
              onClick={publicar}
              disabled={!texto.trim() || enviando}
              className={`inline-flex items-center gap-2 rounded-xl bg-naranjo font-bold text-white shadow-sm transition hover:bg-naranjo-suave active:scale-[0.98] disabled:opacity-40 ${
                compacto ? "h-9 px-4 text-sm" : "h-10 px-5 text-sm"
              }`}
            >
              {enviando ? <IconLoader2 size={17} className="animate-spin" /> : <IconSend2 size={17} />} {boton}
            </button>
          </div>
        </div>
        {sugerir && candidatas.length > 0 && (
          <ul className="animar-aviso absolute left-11 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-borde bg-superficie py-1 shadow-[0_18px_40px_-14px_rgba(23,20,17,0.35)] sm:right-auto sm:w-80">
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
                  {p.correo === TODOS ? (
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-naranjo text-white"><IconUsersGroup size={15} /></span>
                  ) : (
                    <Avatar correo={p.correo} nombre={p.nombre} tamano="h-7 w-7 text-[10px]" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-tinta">{p.correo === TODOS ? "@todos" : p.nombre}</span>
                    <span className="block truncate text-[11px] text-gris">{p.correo === TODOS ? "Menciona a toda la empresa" : p.correo}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
