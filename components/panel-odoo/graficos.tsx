"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
// Solo tipos: un `import type` no llega al bundle, así que pedirle las firmas a
// la implementación no arrastra Recharts hasta acá.
import type * as Impl from "./graficos-apex";

/**
 * Los gráficos de Panel Odoo, cargados recién en el navegador.
 *
 * Este archivo no dibuja nada: solo diferido. Las implementaciones están en
 * ./graficos-apex.tsx y las tarjetas siguen importando los mismos cinco nombres
 * desde acá, sin tocar una línea.
 *
 * El motivo del diferido es que hoy el servidor renderiza estos gráficos y ese
 * render no produce ningún gráfico: la biblioteca mide el DOM para saber de qué
 * tamaño dibujar, y en el servidor no hay DOM, así que el HTML sale con el
 * contenedor vacío y el SVG aparece recién después de hidratar. Prerenderizar
 * siete de estos por carga era trabajo de servidor que nadie llegaba a ver.
 *
 * Con `ssr: false` se saltan dos costos a la vez: el render en el servidor, que
 * está en el camino del TTFB, y el peso de la biblioteca en el JavaScript
 * inicial, que pasa a un chunk aparte pedido después de la primera pintada.
 *
 * Lo que NO cambia es cuándo se ven los gráficos: se veían después de hidratar y
 * se siguen viendo después de hidratar. Y no cambia nada de los datos: las
 * tarjetas siguen llegando con el 100% de sus cifras en el HTML, que es el pedido
 * de siempre para este panel. Lo que se mueve es solo la biblioteca que los pinta.
 *
 * El envoltorio reserva el alto desde la primera pintada, así que el chunk puede
 * llegar cuando quiera sin correr el resto de la tarjeta.
 */

// Los mismos altos que la implementación (ALTO = 96 px, ALTO_EXPANDIDO = 224 px en
// ./graficos-apex.tsx). Van como MÍNIMO y no como alto fijo: la dona con leyenda dibuja
// una fila de rótulos debajo del gráfico, y con un alto fijo esa fila se montaba sobre lo
// que viene después.

/** Reserva el espacio del gráfico mientras su chunk viaja. */
function Reserva({ expandido, children }: { expandido?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: expandido ? 224 : 96 }} className="w-full">
      {children}
    </div>
  );
}

// Una llamada por gráfico y no un helper genérico: `dynamic()` infiere las props
// del componente que carga, y un helper parametrizado por nombre le deja una
// unión de las cinco firmas, que no calzan entre sí.
//
// Las opciones van repetidas y no en una constante compartida porque el
// compilador las exige como objeto literal ("next/dynamic options must be an
// object literal"): las lee en tiempo de build para armar el code splitting, así
// que no puede seguir una referencia.
//
// `loading: () => null` y no un esqueleto: el alto ya lo reserva <Reserva>, y algo
// que aparece y desaparece en unos milisegundos se lee como un parpadeo.
const AreaSimple = dynamic(() => import("./graficos-apex").then((m) => m.GraficoAreaSimple), {
  ssr: false,
  loading: () => null,
});
const BarrasDobles = dynamic(() => import("./graficos-apex").then((m) => m.GraficoBarrasDobles), {
  ssr: false,
  loading: () => null,
});
const Dona = dynamic(() => import("./graficos-apex").then((m) => m.GraficoDona), {
  ssr: false,
  loading: () => null,
});
const BarrasRanking = dynamic(() => import("./graficos-apex").then((m) => m.GraficoBarrasRanking), {
  ssr: false,
  loading: () => null,
});
const BarraApilada = dynamic(() => import("./graficos-apex").then((m) => m.GraficoBarraApilada), {
  ssr: false,
  loading: () => null,
});

export function GraficoAreaSimple(props: ComponentProps<typeof Impl.GraficoAreaSimple>) {
  return (
    <Reserva expandido={props.expandido}>
      <AreaSimple {...props} />
    </Reserva>
  );
}

export function GraficoBarrasDobles(props: ComponentProps<typeof Impl.GraficoBarrasDobles>) {
  return (
    <Reserva expandido={props.expandido}>
      <BarrasDobles {...props} />
    </Reserva>
  );
}

export function GraficoDona(props: ComponentProps<typeof Impl.GraficoDona>) {
  return (
    <Reserva expandido={props.expandido}>
      <Dona {...props} />
    </Reserva>
  );
}

export function GraficoBarrasRanking(props: ComponentProps<typeof Impl.GraficoBarrasRanking>) {
  return (
    <Reserva expandido={props.expandido}>
      <BarrasRanking {...props} />
    </Reserva>
  );
}

export function GraficoBarraApilada(props: ComponentProps<typeof Impl.GraficoBarraApilada>) {
  return (
    <Reserva expandido={props.expandido}>
      <BarraApilada {...props} />
    </Reserva>
  );
}
