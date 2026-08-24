import { verificarAccesoOfertasApi, obtenerOferta } from "@/lib/ofertas/datos";
import { ofertaAHtmlConEmpresa } from "@/lib/ofertas/pdf";
import type { OfertaCanonica } from "@/lib/ofertas/tipos";

export const runtime = "nodejs";
// No levanta Chromium: arma el HTML y baja los logos y las fotos del borrador.
export const maxDuration = 60;

/**
 * La maqueta del documento para un contenido que todavía no está guardado.
 *
 * Es lo que hace posible editar sobre el documento. `?formato=html` de la ruta del
 * PDF sirve para mirar, pero dibuja lo que hay en la base; acá el contenido viene
 * en el cuerpo, así que la pantalla puede mostrar el documento tal como quedaría
 * con lo que se está corrigiendo en ese momento, sin guardar primero.
 *
 * No escribe nada. Es un GET con cuerpo, que no existe: por eso es POST.
 *
 * ── Por qué la CSP es distinta de la de `?formato=html` ────────────────────
 *
 * Aquella va con `sandbox` a secas, que además de apagar los scripts pone al
 * documento en un origen opaco. Eso está bien para mirarlo suelto en una pestaña y
 * no sirve acá: el editor tiene que poder tocar el DOM del iframe desde la página,
 * y con origen opaco no puede. Así que en vez del sandbox entero va lo mismo pero
 * por partes —nada carga, nada se ejecuta, solo imágenes en data URI y los estilos
 * en línea de la propia plantilla—, que deja el documento igual de inerte y del
 * mismo origen. El `<iframe>` suma `sandbox="allow-same-origin"` sin
 * `allow-scripts`, que es el otro lado de la misma reja.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoOfertasApi();
  // Devuelve HTML, no JSON: el error va en texto plano.
  if (!acceso.usuario) return new Response(acceso.error, { status: acceso.status });
  const { id } = await params;

  const oferta = await obtenerOferta(id);
  if (!oferta) return new Response("La oferta no existe.", { status: 404 });

  const cuerpo = (await request.json().catch(() => null)) as { contenido?: OfertaCanonica } | null;
  // Sin contenido en el cuerpo se dibuja lo guardado: así la vista sirve también
  // recién abierta la pantalla, antes de tocar nada.
  const contenido = cuerpo?.contenido ?? oferta.contenido;
  if (typeof contenido !== "object" || contenido === null) {
    return new Response("El contenido de la oferta no es válido.", { status: 400 });
  }

  try {
    const html = await ofertaAHtmlConEmpresa(
      contenido,
      oferta.empresa,
      oferta.maestroId,
      oferta.logoClienteRuta,
      oferta.imagenes,
    );
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy":
          "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; " +
          "form-action 'none'; base-uri 'none'; frame-ancestors 'self'",
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error("[ofertas] la vista del documento falló:", detalle);
    return new Response(detalle, { status: 500 });
  }
}
