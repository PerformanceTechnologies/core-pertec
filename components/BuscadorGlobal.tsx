"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { IconSearch, IconLayoutDashboard, IconUsers, IconSettings2 } from "@tabler/icons-react";
import { obtenerIcono } from "@/lib/iconos";
import type { Aplicacion } from "@/lib/tipos";

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
      const seleccionado = resultados[indiceEfectivo];
      if (seleccionado) irA(seleccionado);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 px-4 pt-24" onClick={alCerrar}>
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-borde bg-white shadow-lg"
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
            placeholder="Buscar una app o sección..."
            className="w-full bg-transparent text-sm text-tinta placeholder:text-tinta/35 focus:outline-none"
          />
        </div>

        <div className="max-h-80 overflow-y-auto py-1.5">
          {resultados.length === 0 && (
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
        </div>
      </div>
    </div>
  );
}
