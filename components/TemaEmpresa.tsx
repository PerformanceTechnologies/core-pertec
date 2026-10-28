"use client";

import { useEffect } from "react";
import { temaDeEmpresa } from "@/lib/empresas-modelo";

/**
 * Deja la paleta de <html> alineada con la empresa activa ya resuelta.
 *
 * El layout raíz estampa data-empresa desde la cookie, que es lo que evita el
 * parpadeo en la primera pintada. Pero la cookie es solo una preferencia: si a
 * la persona le quitaron esa empresa, el layout protegido resuelve otra, y sin
 * esto la página quedaría con los colores de una empresa y los datos de otra.
 */
export default function TemaEmpresa({ slug }: { slug: string | null }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-empresa", temaDeEmpresa(slug));
  }, [slug]);
  return null;
}
