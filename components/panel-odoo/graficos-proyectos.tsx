"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
// Solo tipos: un `import type` no llega al bundle.
import type * as Impl from "./graficos-proyectos-apex";

/**
 * Los gráficos de Proyectos, cargados recién en el navegador.
 *
 * Mismo patrón y mismos motivos que ./graficos-gastos.tsx, ./graficos-crm.tsx y los
 * demás: Apex mide el DOM para dibujar y su peso no tiene por qué viajar en el
 * JavaScript inicial del panel. El chunk se pide al abrir el detalle.
 *
 * Las opciones van repetidas y no en una constante compartida porque el compilador las
 * exige como objeto literal: las lee en tiempo de build para armar el code splitting.
 */

const Etapa = dynamic(() => import("./graficos-proyectos-apex").then((m) => m.GraficoPorEtapa), {
  ssr: false,
  loading: () => null,
});
const Responsable = dynamic(() => import("./graficos-proyectos-apex").then((m) => m.GraficoPorResponsable), {
  ssr: false,
  loading: () => null,
});
const Proyecto = dynamic(() => import("./graficos-proyectos-apex").then((m) => m.GraficoPorProyecto), {
  ssr: false,
  loading: () => null,
});
const Plazos = dynamic(() => import("./graficos-proyectos-apex").then((m) => m.GraficoHorizonteDePlazos), {
  ssr: false,
  loading: () => null,
});
const Salud = dynamic(() => import("./graficos-proyectos-apex").then((m) => m.GraficoSalud), {
  ssr: false,
  loading: () => null,
});
const Categoria = dynamic(() => import("./graficos-proyectos-apex").then((m) => m.GraficoGastoPorCategoria), {
  ssr: false,
  loading: () => null,
});
const Presupuesto = dynamic(() => import("./graficos-proyectos-apex").then((m) => m.GraficoPresupuesto), {
  ssr: false,
  loading: () => null,
});
const Horas = dynamic(() => import("./graficos-proyectos-apex").then((m) => m.GraficoHoras), {
  ssr: false,
  loading: () => null,
});
const Avance = dynamic(() => import("./graficos-proyectos-apex").then((m) => m.GraficoAvance), {
  ssr: false,
  loading: () => null,
});

/** Reserva el alto desde la primera pintada, para que el chunk pueda llegar sin correr nada. */
function Reserva({ alto, children }: { alto: number; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: alto }} className="w-full">
      {children}
    </div>
  );
}

export function GraficoPorEtapa(props: ComponentProps<typeof Impl.GraficoPorEtapa>) {
  return (
    <Reserva alto={260}>
      <Etapa {...props} />
    </Reserva>
  );
}

export function GraficoPorResponsable(props: ComponentProps<typeof Impl.GraficoPorResponsable>) {
  return (
    <Reserva alto={260}>
      <Responsable {...props} />
    </Reserva>
  );
}

export function GraficoPorProyecto(props: ComponentProps<typeof Impl.GraficoPorProyecto>) {
  return (
    <Reserva alto={260}>
      <Proyecto {...props} />
    </Reserva>
  );
}

export function GraficoHorizonteDePlazos(props: ComponentProps<typeof Impl.GraficoHorizonteDePlazos>) {
  return (
    <Reserva alto={200}>
      <Plazos {...props} />
    </Reserva>
  );
}

export function GraficoSalud(props: ComponentProps<typeof Impl.GraficoSalud>) {
  return (
    <Reserva alto={220}>
      <Salud {...props} />
    </Reserva>
  );
}

export function GraficoGastoPorCategoria(props: ComponentProps<typeof Impl.GraficoGastoPorCategoria>) {
  return (
    <Reserva alto={220}>
      <Categoria {...props} />
    </Reserva>
  );
}

export function GraficoPresupuesto(props: ComponentProps<typeof Impl.GraficoPresupuesto>) {
  return (
    <Reserva alto={260}>
      <Presupuesto {...props} />
    </Reserva>
  );
}

export function GraficoHoras(props: ComponentProps<typeof Impl.GraficoHoras>) {
  return (
    <Reserva alto={260}>
      <Horas {...props} />
    </Reserva>
  );
}

export function GraficoAvance(props: ComponentProps<typeof Impl.GraficoAvance>) {
  return (
    <Reserva alto={260}>
      <Avance {...props} />
    </Reserva>
  );
}
