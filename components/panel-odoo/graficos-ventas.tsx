"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
// Solo tipos: un `import type` no llega al bundle.
import type * as Impl from "./graficos-ventas-apex";

/**
 * Los gráficos de Ventas y Arriendo, cargados recién en el navegador.
 *
 * Mismo patrón y mismos motivos que ./graficos-facturas.tsx y ./graficos-crm.tsx: Apex
 * mide el DOM para dibujar y su peso no tiene por qué viajar en el JavaScript inicial del
 * panel. El chunk se pide al abrir el detalle.
 *
 * Las opciones van repetidas y no en una constante compartida porque el compilador las
 * exige como objeto literal: las lee en tiempo de build para armar el code splitting.
 */

const Tendencia = dynamic(() => import("./graficos-ventas-apex").then((m) => m.GraficoTendenciaVentas), {
  ssr: false,
  loading: () => null,
});
const Plata = dynamic(() => import("./graficos-ventas-apex").then((m) => m.GraficoDondeEstaLaPlata), {
  ssr: false,
  loading: () => null,
});
const Arriendos = dynamic(() => import("./graficos-ventas-apex").then((m) => m.GraficoArriendosPorEstado), {
  ssr: false,
  loading: () => null,
});
const Vendedores = dynamic(() => import("./graficos-ventas-apex").then((m) => m.GraficoVendedoresVentas), {
  ssr: false,
  loading: () => null,
});
const Vencimientos = dynamic(() => import("./graficos-ventas-apex").then((m) => m.GraficoVencimientos), {
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

export function GraficoTendenciaVentas(props: ComponentProps<typeof Impl.GraficoTendenciaVentas>) {
  return (
    <Reserva alto={260}>
      <Tendencia {...props} />
    </Reserva>
  );
}

export function GraficoDondeEstaLaPlata(props: ComponentProps<typeof Impl.GraficoDondeEstaLaPlata>) {
  return (
    <Reserva alto={220}>
      <Plata {...props} />
    </Reserva>
  );
}

export function GraficoArriendosPorEstado(props: ComponentProps<typeof Impl.GraficoArriendosPorEstado>) {
  return (
    <Reserva alto={260}>
      <Arriendos {...props} />
    </Reserva>
  );
}

export function GraficoVendedoresVentas(props: ComponentProps<typeof Impl.GraficoVendedoresVentas>) {
  return (
    <Reserva alto={260}>
      <Vendedores {...props} />
    </Reserva>
  );
}

export function GraficoVencimientos(props: ComponentProps<typeof Impl.GraficoVencimientos>) {
  return (
    <Reserva alto={200}>
      <Vencimientos {...props} />
    </Reserva>
  );
}
