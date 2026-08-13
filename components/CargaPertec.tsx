/**
 * La pantalla de espera de un módulo, con la marca.
 *
 * La quebrada que se dibuja es LA MISMA del patrón topográfico que ya está de
 * fondo en todo el core (public/patron-topografico.svg, mismos puntos): mientras
 * carga, ese patrón que normalmente es textura pasa a primer plano y se dibuja
 * solo. Por eso no lleva el logo — la línea ya es la marca, y un PNG acá sería
 * un pedido de red más justo cuando la página todavía está esperando.
 *
 * No es un componente cliente: es SVG y dos clases de animación de globals.css,
 * así que un `loading.tsx` lo renderiza desde el servidor sin arrastrar un solo
 * kilobyte de JavaScript. Eso importa especialmente acá: esto se muestra
 * mientras el bundle de la página todavía se está descargando.
 */
export default function CargaPertec({ modulo }: { modulo: string }) {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6"
      // El lector de pantalla anuncia el estado una vez, con el nombre del
      // módulo; el dibujo va oculto porque no agrega nada hablado.
      role="status"
      aria-live="polite"
    >
      <svg viewBox="0 0 180 100" className="w-full max-w-[16rem]" fill="none" aria-hidden="true">
        {/* La quebrada tenue de atrás: el recorrido completo, para que se vea
            hacia dónde va el trazo en vez de aparecer de la nada. */}
        <polyline
          points="0,78 22,26 45,56 68,10 90,78 112,26 135,56 158,10 180,78"
          stroke="currentColor"
          className="text-tinta/10"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* La segunda línea del patrón, en teal y corrida, igual que en el SVG
            del fondo. Va con un retraso para que las dos no dibujen al unísono. */}
        <polyline
          points="0,92 22,40 45,70 68,24 90,92 112,40 135,70 158,24 180,92"
          stroke="var(--color-teal)"
          strokeOpacity="0.35"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className="animar-trazo-topo"
          // Va 0,35 s atrás del trazo naranjo, no adelante: el color de marca es
          // el que tiene que ir guiando, y el teal lo sigue.
          style={{ animationDelay: "0.35s" }}
        />

        <polyline
          points="0,78 22,26 45,56 68,10 90,78 112,26 135,56 158,10 180,78"
          stroke="var(--color-naranjo)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className="animar-trazo-topo"
        />
      </svg>

      <div className="flex flex-col items-center gap-1.5 text-center">
        <p className="font-condensed text-sm font-bold uppercase tracking-[0.3em] text-tinta">Pertec</p>
        <p className="animar-latido-marca font-condensed text-xs font-semibold uppercase tracking-[0.18em] text-tinta/50">
          Cargando {modulo}
        </p>
      </div>
    </div>
  );
}
