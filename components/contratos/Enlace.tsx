"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useRutaDelContrato } from "./ContratoProvider";

/**
 * `next/link` con el contrato puesto.
 *
 * Reemplaza a Link en todo lo que viene de core-ih: las direcciones están escritas como
 * «/contratos/acreditacion» y acá se convierten en «/contratos/<contrato>/acreditacion» (ver
 * lib/contratos/rutas.ts). Sirve desde componentes de servidor y de cliente por igual.
 */
export default function Enlace({ href, ...resto }: ComponentProps<typeof Link>) {
  const ruta = useRutaDelContrato();
  return <Link href={typeof href === "string" ? ruta(href) : href} {...resto} />;
}

/** Un `<a>` normal con el contrato puesto: para las descargas, que no deben pasar por el enrutador. */
export function AnclaDeContrato({ href, ...resto }: ComponentProps<"a">) {
  const ruta = useRutaDelContrato();
  return <a href={href ? ruta(href) : href} {...resto} />;
}
