"use client";

import { createContext, useContext } from "react";
import { enContrato } from "@/lib/contratos/rutas";

/**
 * El contrato de la página, para los componentes del navegador.
 *
 * Lo pone el layout de /contratos/[contrato]. Con él, `Enlace` y `useRutaDelContrato` arman las
 * direcciones del contrato sin que cada componente tenga que recibirlo.
 */
const ContratoContext = createContext<string | null>(null);

export function ContratoProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  return <ContratoContext.Provider value={slug}>{children}</ContratoContext.Provider>;
}

/** El contrato de la página, o null fuera de uno (la lista de contratos). */
export function useContrato(): string | null {
  return useContext(ContratoContext);
}

/** `ruta("/contratos/acreditacion")` → «/contratos/<contrato>/acreditacion». */
export function useRutaDelContrato(): (href: string) => string {
  const slug = useContrato();
  return (href: string) => (slug ? enContrato(slug, href) : href);
}
