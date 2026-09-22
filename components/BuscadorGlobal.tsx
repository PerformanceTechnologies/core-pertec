"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { IconSearch, IconLayoutDashboard, IconUsers, IconSettings2, IconSparkles } from "@tabler/icons-react";
import { obtenerIcono } from "@/lib/iconos";
import type { Aplicacion } from "@/lib/tipos";

interface RespuestaConsulta {
  texto: string;
  pasos: { herramienta: string; argumentos: Record<string, unknown>; filas: number }[];
}

interface ItemBusqueda {
  id: string;
  etiqueta: string;
  descripcion?: string | null;
  href: string;
  icono: ReactNode;
  externo: boolean;
}

function construirItems(apps: Aplicacion[], esAdmin: boolean): ItemBusqueda[] {
  const items: ItemBusqueda[] = [
    { id: "dashboard", etiqueta: "Dashboard", href: "/", icono: <IconLayoutDashboard size={17} stroke={1.75} />, externo: false },
  ];

  apps
    .filter((app) => app.estado !== "mantenimiento")
    .forEach((app) => {
      const Icono = obtenerIcono(app.icono);
      const externo = app.tipo !== "interna";
      const href = !externo ? app.url : app.url.startsWith("http") ? app.url : `https://${app.url}`;
      items.push({
        id: app.id,
        etiqueta: app.nombre,
        descripcion: app.descripcion,
        href,
        icono: <Icono size={17} stroke={1.75} />,
        externo,
      });
    });

  if (esAdmin) {
    items.push(
      { id: "usuarios", etiqueta: "Usuarios", href: "/usuarios", icono: <IconUsers size={17} stroke={1.75} />, externo: false },
      { id: "aplicaciones", etiqueta: "Aplicaciones", href: "/aplicaciones", icono: <IconSettings2 size={17} stroke={1.75} />, externo: false }
    );
  }

  return items;
}

// Se monta solo mientras está abierto (ver BarraLateral: `{abierto && <BuscadorGlobal .../>}`)
// en vez de recibir un prop `abierto` y quedar siempre montado: así cada
// apertura es una instancia nueva con estado limpio (consulta/índice en
// cero) sin necesitar un efecto que resetee estado ni un ref leído durante
// el render -- ambos patrones que el lint de este proyecto rechaza.
export default function BuscadorGlobal({
  alCerrar,
  apps,
  esAdmin,
}: {
  alCerrar: () => void;
  apps: Aplicacion[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [consulta, setConsulta] = useState("");
  const [indice, setIndice] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // La consulta a los datos es OPT-IN por pregunta: navegar sigue siendo
  // instantáneo y sin red. Solo se llama al modelo cuando alguien elige
  // explícitamente "Preguntar a los datos".
  const [preguntando, setPreguntando] = useState(false);
  const [respuesta, setRespuesta] = useState<RespuestaConsulta | null>(null);
  const [errorConsulta, setErrorConsulta] = useState<string | null>(null);

  const todosLosItems = useMemo(() => construirItems(apps, esAdmin), [apps, esAdmin]);
  const resultados = useMemo(() => {
    const q = consulta.trim().toLowerCase();
    if (!q) return todosLosItems;
    return todosLosItems.filter((item) => item.etiqueta.toLowerCase().includes(q));
  }, [todosLosItems, consulta]);
  // Clampeado en lectura en vez de en un efecto separado que llame setIndice.
  const indiceEfectivo = Math.min(indice, Math.max(resultados.length - 1, 0));

  // Foco del input al montar (= al abrir, ya que el componente solo existe
  // mientras está abierto). No guarda estado de React, solo mueve el foco.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function alTeclado(evento: KeyboardEvent) {
      if (evento.key === "Escape") alCerrar();
    }
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [alCerrar]);

  /** Hay algo escrito que no calza con ninguna app: probablemente sea una pregunta. */
  const hayPregunta = consulta.trim().length >= 3;

  async function preguntarALosDatos() {
    const pregunta = consulta.trim();
    if (!pregunta || preguntando) return;
    setPreguntando(true);
    setRespuesta(null);
    setErrorConsulta(null);
    try {
      const r = await fetch("/api/consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta }),
      });
      const cuerpo = await r.json();
      if (!r.ok) setErrorConsulta(cuerpo.error ?? "No se pudo consultar.");
      else setRespuesta(cuerpo as RespuestaConsulta);
    } catch {
      setErrorConsulta("No se pudo consultar: revisá la conexión.");
    } finally {
      setPreguntando(false);
    }
  }

  function irA(item: ItemBusqueda) {
    alCerrar();
    if (item.externo) {
      window.location.href = item.href;
    } else {
      router.push(item.href);
    }
  }

  function alTecladoInput(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setIndice((previo) => Math.min(previo + 1, resultados.length - 1));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setIndice((previo) => Math.max(previo - 1, 0));
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      // Cmd/Ctrl+Enter pregunta sin importar qué fila esté marcada: es el atajo
      // para quien ya sabe que quiere preguntar y no quiere bajar hasta la fila.
      if (evento.metaKey || evento.ctrlKey) return void preguntarALosDatos();
      const seleccionado = resultados[indiceEfectivo];
      if (seleccionado) irA(seleccionado);
      // Sin ninguna app que calce, Enter pregunta: es lo único que queda por
      // hacer con lo que se escribió.
      else if (hayPregunta) void preguntarALosDatos();
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 px-4 pt-24" onClick={alCerrar}>
      {/* Se ensancha al mostrar una respuesta: una cifra con su contexto no entra
          cómoda en el ancho de una lista de accesos directos. */}
      <div
        className={`w-full overflow-hidden rounded-xl border border-borde bg-white shadow-lg transition-[max-width] ${
          respuesta || errorConsulta || preguntando ? "max-w-xl" : "max-w-md"
        }`}
        onClick={(evento) => evento.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-borde px-4 py-3">
          <IconSearch size={17} stroke={1.75} className="shrink-0 text-tinta/40" />
          <input
            ref={inputRef}
            type="text"
            value={consulta}
            onChange={(evento) => setConsulta(evento.target.value)}
            onKeyDown={alTecladoInput}
            placeholder="Buscar una app, o preguntar por los datos…"
            className="w-full bg-transparent text-sm text-tinta placeholder:text-tinta/35 focus:outline-none"
          />
        </div>

        {(preguntando || respuesta || errorConsulta) && (
          <div className="border-b border-borde px-4 py-3">
            {preguntando && <p className="text-sm text-tinta/50">Consultando los datos…</p>}
            {errorConsulta && <p className="text-sm text-red-600">{errorConsulta}</p>}
            {respuesta && (
              <>
                {/* whitespace-pre-wrap: la respuesta puede traer una lista corta
                    en varias líneas y en un solo párrafo no se lee. */}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-tinta">{respuesta.texto}</p>
                {respuesta.pasos.length > 0 && (
                  <details className="mt-2 text-xs text-tinta/50">
                    {/* Qué consultó para llegar ahí. Sin esto hay que creerle a
                        una cifra sobre plata de la empresa. */}
                    <summary className="cursor-pointer">Qué consultó</summary>
                    <ul className="mt-1 font-mono leading-relaxed">
                      {respuesta.pasos.map((p, i) => (
                        <li key={i} className="break-words">
                          {p.herramienta}({JSON.stringify(p.argumentos)}) → {p.filas} fila(s)
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>
        )}

        <div className="max-h-80 overflow-y-auto py-1.5">
          {resultados.length === 0 && !hayPregunta && (
            <p className="px-4 py-6 text-center text-sm text-tinta/40">Sin resultados.</p>
          )}
          {resultados.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => irA(item)}
              onMouseEnter={() => setIndice(i)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                i === indiceEfectivo ? "bg-naranjo/10 text-naranjo" : "text-tinta/80"
              }`}
            >
              <span className="shrink-0">{item.icono}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.etiqueta}</span>
                {item.descripcion && (
                  <span className="block truncate text-xs text-tinta/45">{item.descripcion}</span>
                )}
              </span>
            </button>
          ))}

          {hayPregunta && (
            <button
              type="button"
              onClick={() => void preguntarALosDatos()}
              disabled={preguntando}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition disabled:opacity-50 ${
                resultados.length === 0 ? "bg-naranjo/10 text-naranjo" : "text-tinta/80 hover:bg-crema/60"
              }`}
            >
              <IconSparkles size={17} stroke={1.75} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">Preguntar a los datos</span>
                <span className="block truncate text-xs text-tinta/45">«{consulta.trim()}»</span>
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-tinta/30">⌘↵</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
