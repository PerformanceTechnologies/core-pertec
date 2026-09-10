"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
// Solo tipos: un `import type` no llega al bundle.
import type * as Impl from "./graficos-crm-apex";

/**
 * Los gráficos de CRM, cargados recién en el navegador.
 *
 * Mismo patrón y mismos motivos que ./graficos-facturas.tsx: ApexCharts mide el DOM para
 * dibujar y son ~180 KB que no tienen por qué viajar en el JavaScript inicial del panel.
 * El chunk se pide al abrir el detalle, que es la mayoría de las veces nunca.
 *
 * Las opciones van repetidas y no en una constante compartida porque el compilador las
 * exige como objeto literal: las lee en tiempo de build para armar el code splitting.
 */

const Embudo = dynamic(() => import("./graficos-crm-apex").then((m) => m.GraficoEmbudo), {
  ssr: false,
  loading: () => null,
});
const Tendencia = dynamic(() => import("./graficos-crm-apex").then((m) => m.GraficoTendenciaCrm), {
  ssr: false,
  loading: () => null,
});
const Torta = dynamic(() => import("./graficos-crm-apex").then((m) => m.GraficoTortaCrm), {
  ssr: false,
  loading: () => null,
});
const Vendedores = dynamic(() => import("./graficos-crm-apex").then((m) => m.GraficoVendedores), {
  ssr: false,
  loading: () => null,
});
const Antiguedad = dynamic(() => import("./graficos-crm-apex").then((m) => m.GraficoAntiguedad), {
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

export function GraficoEmbudo(props: ComponentProps<typeof Impl.GraficoEmbudo>) {
  return (
    <Reserva alto={260}>
      <Embudo {...props} />
    </Reserva>
  );
}

export function GraficoTendenciaCrm(props: ComponentProps<typeof Impl.GraficoTendenciaCrm>) {
  return (
    <Reserva alto={240}>
      <Tendencia {...props} />
    </Reserva>
  );
}

export function GraficoTortaCrm(props: ComponentProps<typeof Impl.GraficoTortaCrm>) {
  return (
    <Reserva alto={220}>
      <Torta {...props} />
    </Reserva>
  );
}

export function GraficoVendedores(props: ComponentProps<typeof Impl.GraficoVendedores>) {
  return (
    <Reserva alto={260}>
      <Vendedores {...props} />
    </Reserva>
  );
}

export function GraficoAntiguedad(props: ComponentProps<typeof Impl.GraficoAntiguedad>) {
  return (
    <Reserva alto={200}>
      <Antiguedad {...props} />
    </Reserva>
  );
}
