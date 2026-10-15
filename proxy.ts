import { NextResponse, type NextRequest } from "next/server";
import { CABECERA_CONTRATO } from "@/lib/contratos/cabecera";

/**
 * Le dice al servidor en qué contrato se está trabajando.
 *
 * Todo lo de Contratos vive bajo /contratos/<contrato>/…: las páginas, las Server Actions (que se
 * envían a la dirección de la página que las llama) y las descargas. Acá se saca el contrato de la
 * dirección y se pasa en una cabecera, y `contratoActual()` la lee desde cualquier parte del
 * servidor. Sin esto, el contrato tendría que viajar a mano por cientos de funciones.
 *
 * La cabecera que mande el navegador se BORRA siempre antes de poner la propia: si no, cualquiera
 * podría elegir el contrato con una cabecera inventada.
 *
 * Solo corre en /contratos: el resto de core-pertec no pasa por acá.
 */
export function proxy(request: NextRequest) {
  const cabeceras = new Headers(request.headers);
  cabeceras.delete(CABECERA_CONTRATO);

  const [, , slug] = request.nextUrl.pathname.split("/");
  if (slug && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) cabeceras.set(CABECERA_CONTRATO, slug);

  return NextResponse.next({ request: { headers: cabeceras } });
}

export const config = {
  matcher: ["/contratos", "/contratos/:path*"],
};
