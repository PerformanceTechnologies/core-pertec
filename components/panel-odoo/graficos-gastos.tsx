"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
// Solo tipos: un `import type` no llega al bundle.
import type * as Impl from "./graficos-gastos-apex";

/**
 * Los gráficos de Gastos, cargados recién en el navegador.
 *
 * Mismo patrón y mismos motivos que ./graficos-facturas.tsx, ./graficos-crm.tsx y
 * ./graficos-ventas.tsx: Apex mide el DOM para dibujar y su peso no tiene por qué viajar
 * en el JavaScript inicial del panel. El chunk se pide al abrir el detalle.
 *
 * Las opciones van repetidas y no en una constante compartida porque el compilador las
 * exige como objeto literal: las lee en tiempo de build para armar el code splitting.
 */

const Tendencia = dynamic(() => import("./graficos-gastos-apex").then((m) => m.GraficoTendenciaGastos), {
  ssr: false,
  loading: () => null,
});
const Categoria = dynamic(() => import("./graficos-gastos-apex").then((m) => m.GraficoPorCategoria), {
  ssr: false,
  loading: () => null,
});
const Empleado = dynamic(() => import("./graficos-gastos-apex").then((m) => m.GraficoPorEmpleado), {
  ssr: false,
  loading: () => null,
});
const Documento = dynamic(() => import("./graficos-gastos-apex").then((m) => m.GraficoPorTipoDeDocumento), {
  ssr: false,
  loading: () => null,
});
const Proveedor = dynamic(() => import("./graficos-gastos-apex").then((m) => m.GraficoPorProveedor), {
  ssr: false,
  loading: () => null,
});
const Antiguedad = dynamic(() => import("./graficos-gastos-apex").then((m) => m.GraficoAntiguedadSinRendir), {
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

export function GraficoTendenciaGastos(props: ComponentProps<typeof Impl.GraficoTendenciaGastos>) {
  return (
    <Reserva alto={260}>
      <Tendencia {...props} />
    </Reserva>
  );
}

export function GraficoPorCategoria(props: ComponentProps<typeof Impl.GraficoPorCategoria>) {
  return (
    <Reserva alto={220}>
      <Categoria {...props} />
    </Reserva>
  );
}

export function GraficoPorEmpleado(props: ComponentProps<typeof Impl.GraficoPorEmpleado>) {
  return (
    <Reserva alto={260}>
      <Empleado {...props} />
    </Reserva>
  );
}

export function GraficoPorTipoDeDocumento(props: ComponentProps<typeof Impl.GraficoPorTipoDeDocumento>) {
  return (
    <Reserva alto={260}>
      <Documento {...props} />
    </Reserva>
  );
}

export function GraficoPorProveedor(props: ComponentProps<typeof Impl.GraficoPorProveedor>) {
  return (
    <Reserva alto={260}>
      <Proveedor {...props} />
    </Reserva>
  );
}

export function GraficoAntiguedadSinRendir(props: ComponentProps<typeof Impl.GraficoAntiguedadSinRendir>) {
  return (
    <Reserva alto={200}>
      <Antiguedad {...props} />
    </Reserva>
  );
}
