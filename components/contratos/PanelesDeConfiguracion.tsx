"use client";

import { useEffect, useRef, useState } from "react";

export interface PanelDeConfiguracion {
  clave: string;
  titulo: string;
  /** Un número junto al título (cuántos cargos, cuántos documentos). */
  conteo?: number;
  icono: React.ReactNode;
  contenido: React.ReactNode;
}

/**
 * Las pestañas de la configuración: Cargos, Documentos y El contrato, cada una su panel.
 *
 * Eran tres secciones apiladas en una sola hoja larga; para llegar al catálogo de documentos
 * había que bajar pasando por todos los cargos. Ahora cada tema tiene su pestaña y se llega
 * con un clic.
 *
 * Los tres paneles se renderizan siempre (los inactivos con `hidden`): cambiar de pestaña no
 * pide nada al servidor ni pierde lo escrito en el buscador de documentos. La pestaña activa
 * vive en la dirección (`?panel=documentos`), para que se pueda enlazar y para que recargar
 * no devuelva a la primera.
 *
 * Con flechas izquierda y derecha se pasa de una a otra, como en cualquier lista de pestañas.
 */
export default function PanelesDeConfiguracion({
  paneles,
  inicial,
}: {
  paneles: PanelDeConfiguracion[];
  inicial: string;
}) {
  const [activo, setActivo] = useState(
    paneles.some((p) => p.clave === inicial) ? inicial : paneles[0].clave,
  );
  const botones = useRef<Record<string, HTMLButtonElement | null>>({});

  function elegir(clave: string) {
    setActivo(clave);
    // replaceState y no una navegación: no hay nada que pedir al servidor, y cada clic
    // de pestaña no debe sumar una entrada al historial del botón «atrás».
    const url = new URL(window.location.href);
    url.searchParams.set("panel", clave);
    url.hash = "";
    window.history.replaceState(null, "", url);
  }

  // El editor de cargos pide cambiar de pestaña con este evento («¿falta algún documento?»),
  // sin tener que conocer este componente.
  useEffect(() => {
    const alPedir = (e: Event) => {
      const clave = (e as CustomEvent<string>).detail;
      if (paneles.some((p) => p.clave === clave)) elegir(clave);
    };
    window.addEventListener("configuracion:ir-a", alPedir);
    return () => window.removeEventListener("configuracion:ir-a", alPedir);
  }, [paneles]);

  function alTeclear(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const siguiente = paneles[(i + (e.key === "ArrowRight" ? 1 : -1) + paneles.length) % paneles.length];
    elegir(siguiente.clave);
    botones.current[siguiente.clave]?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Secciones de la configuración"
        // overflow-y-hidden: un contenedor con overflow-x-auto pasa a tener también scroll
        // vertical, y cualquier desborde de un píxel muestra una barra. Y sin `-mb-px` en las
        // pestañas, por lo mismo: el subrayado de la activa queda sobre la línea, no encima.
        className="mt-6 flex gap-0.5 overflow-x-auto overflow-y-hidden border-b border-borde [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1"
      >
        {paneles.map((p, i) => {
          const seleccionado = p.clave === activo;
          return (
            <button
              key={p.clave}
              ref={(el) => {
                botones.current[p.clave] = el;
              }}
              type="button"
              role="tab"
              id={`pestana-${p.clave}`}
              aria-selected={seleccionado}
              aria-controls={`panel-${p.clave}`}
              tabIndex={seleccionado ? 0 : -1}
              onClick={() => elegir(p.clave)}
              onKeyDown={(e) => alTeclear(e, i)}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-xs sm:gap-2 sm:px-4 font-bold uppercase tracking-wide transition ${
                seleccionado
                  ? "border-cian text-azul"
                  : "border-transparent text-gris hover:text-azul"
              }`}
            >
              <span aria-hidden className={seleccionado ? "text-cian-texto" : "text-gris-suave"}>
                {p.icono}
              </span>
              {p.titulo}
              {p.conteo !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    seleccionado ? "bg-cian-lavado text-cian-texto" : "bg-borde/70 text-gris"
                  }`}
                >
                  {p.conteo}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {paneles.map((p) => (
        <div
          key={p.clave}
          role="tabpanel"
          id={`panel-${p.clave}`}
          aria-labelledby={`pestana-${p.clave}`}
          hidden={p.clave !== activo}
          className="pt-6"
        >
          {p.contenido}
        </div>
      ))}
    </div>
  );
}
