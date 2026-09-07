"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
// Solo tipos: un `import type` no llega al bundle, así que pedirle las firmas a la
// implementación no arrastra ApexCharts hasta acá.
import type * as Impl from "./graficos-facturas-apex";

/**
 * Los gráficos de facturas, cargados recién en el navegador.
 *
 * Mismo patrón que ./graficos.tsx y por los mismos dos motivos: ApexCharts mide el DOM
 * para dibujar —en el servidor no hay DOM, así que el render de servidor no produce
 * ningún gráfico— y son ~180 KB que no tienen por qué estar en el JavaScript inicial del
 * panel.
 *
 * Acá pesa todavía más que en los de Recharts: estos viven dentro del modal de detalle de
 * Facturas, así que la mayoría de las visitas al panel no los abre nunca. El chunk se
 * pide cuando se abre el detalle y no antes.
 *
 * Cada envoltorio reserva su alto desde la primera pintada para que el chunk pueda llegar
 * cuando quiera sin correr el resto del modal.
 */

// Las opciones van repetidas y no en una constante compartida porque el compilador las
// exige como objeto literal: las lee en tiempo de build para armar el code splitting.
const Tendencia = dynamic(() => import("./graficos-facturas-apex").then((m) => m.GraficoTendenciaFacturas), {
  ssr: false,
  loading: () => null,
});
const Torta = dynamic(() => import("./graficos-facturas-apex").then((m) => m.GraficoTortaFacturas), {
  ssr: false,
  loading: () => null,
});
const TopContrapartes = dynamic(() => import("./graficos-facturas-apex").then((m) => m.GraficoTopContrapartes), {
  ssr: false,
  loading: () => null,
});
const Mora = dynamic(() => import("./graficos-facturas-apex").then((m) => m.GraficoMora), {
  ssr: false,
  loading: () => null,
});

function Reserva({ alto, children }: { alto: number; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: alto }} className="w-full">
      {children}
    </div>
  );
}

export function GraficoTendenciaFacturas(props: ComponentProps<typeof Impl.GraficoTendenciaFacturas>) {
  return (
    <Reserva alto={240}>
      <Tendencia {...props} />
    </Reserva>
  );
}

export function GraficoTortaFacturas(props: ComponentProps<typeof Impl.GraficoTortaFacturas>) {
  return (
    <Reserva alto={220}>
      <Torta {...props} />
    </Reserva>
  );
}

export function GraficoTopContrapartes(props: ComponentProps<typeof Impl.GraficoTopContrapartes>) {
  return (
    <Reserva alto={260}>
      <TopContrapartes {...props} />
    </Reserva>
  );
}

export function GraficoMora(props: ComponentProps<typeof Impl.GraficoMora>) {
  return (
    <Reserva alto={200}>
      <Mora {...props} />
    </Reserva>
  );
}
