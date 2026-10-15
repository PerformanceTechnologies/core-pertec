import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/contratos/usuarios";
import { leerLogo } from "@/lib/contratos/contratos";

/**
 * El logo de un contrato, como imagen.
 *
 * Aparte y no dentro de cada página: el menú lo muestra en todas, y con la versión en la URL
 * (?v=…) el navegador lo guarda y no lo vuelve a pedir hasta que cambie. Solo para quien puede
 * entrar a Contratos.
 */
export async function GET(_peticion: Request, { params }: { params: Promise<{ contrato: string }> }) {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario || (usuario.rol !== "admin" && usuario.aplicacionIds.length === 0)) {
    return new NextResponse(null, { status: 401 });
  }

  const { contrato } = await params;
  const logo = await leerLogo(contrato);
  if (!logo) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": logo.tipo,
      // Privada (no la guarda un CDN compartido) y larga: la URL cambia cuando cambia el logo.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
