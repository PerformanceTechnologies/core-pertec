import { NextResponse } from "next/server";
import { crearOferta, exigirAccesoOfertas, guardarLogoCliente } from "@/lib/ofertas/datos";
import { leerBorrador } from "@/lib/ofertas/leer";
import { formatoDe } from "@/lib/cotizador/obra/formatos";
import { esEmpresaValida, type Empresa } from "@/lib/cotizador/empresas";
import { esFormatoDeLogo, LIMITE_SUBIDA_LOGO } from "@/lib/ofertas/logo";
import { normalizarLogo, subirLogo } from "@/lib/ofertas/logos-archivo";

export const runtime = "nodejs";
// Normalizar una oferta completa —diez secciones con sus tablas— tarda bastante
// más que leer una boleta.
export const maxDuration = 120;

/**
 * Paso 1: sube un borrador y queda normalizado, con sus controles corridos.
 *
 * Va por route handler y no por Server Action porque un borrador con imágenes
 * pesa varios MB y el body de una Server Action está limitado a 1 MB.
 *
 * No emite nada: deja la oferta en estado borrador para que una persona revise
 * las inconsistencias antes de generar el PDF. Ese corte en el medio es lo que
 * hace que los avisos sirvan de algo.
 *
 * El logo del cliente viene acá, junto al borrador, porque es el momento en que
 * la persona tiene los dos archivos a mano: el que le mandaron y la marca del
 * mandante. Es opcional y se puede cambiar después en la oferta.
 */
export async function POST(request: Request) {
  const usuario = await exigirAccesoOfertas();

  const formulario = await request.formData();
  const archivo = formulario.get("archivo");
  const logo = formulario.get("logoCliente");
  const empresaCruda = String(formulario.get("empresa") ?? "");

  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }
  if (!formatoDe(archivo.type, archivo.name)) {
    return NextResponse.json(
      { error: "El borrador tiene que ser un Word (.docx), un PDF o un Excel (.xlsx, .xlsm)." },
      { status: 400 },
    );
  }
  if (!esEmpresaValida(empresaCruda)) {
    return NextResponse.json({ error: "Empresa emisora no válida." }, { status: 400 });
  }
  const empresa: Empresa = empresaCruda;

  // El logo se valida ANTES de llamar al modelo, aunque se guarde después: un
  // formato equivocado avisa al instante en vez de después de dos minutos de
  // lectura, y de paso no se gastan tokens para nada.
  const logoCliente = logo instanceof File && logo.size > 0 ? logo : null;
  if (logoCliente && !esFormatoDeLogo(logoCliente.type, logoCliente.name)) {
    return NextResponse.json(
      { error: "El logo del cliente tiene que ser un PNG, un JPG, un WEBP o un SVG." },
      { status: 400 },
    );
  }
  if (logoCliente && logoCliente.size > LIMITE_SUBIDA_LOGO) {
    const mb = (logoCliente.size / 1024 / 1024).toFixed(1);
    return NextResponse.json(
      { error: `El logo pesa ${mb} MB y el tope es 4 MB. Exportalo más chico.` },
      { status: 400 },
    );
  }

  try {
    const contenido = await leerBorrador(
      Buffer.from(await archivo.arrayBuffer()),
      archivo.type,
      archivo.name,
    );
    const { id, inconsistencias } = await crearOferta(contenido, empresa, archivo.name, usuario.id);

    // El logo va después de que la oferta existe: al revés, un archivo subido
    // para una oferta que no se llegó a crear queda huérfano en el bucket. Y si
    // falla, la oferta NO se pierde — se avisa y se puede subir de nuevo en la
    // pantalla de la oferta, que es el trabajo caro ya hecho.
    let avisoLogo: string | null = null;
    if (logoCliente) {
      try {
        const png = await normalizarLogo(Buffer.from(await logoCliente.arrayBuffer()));
        await guardarLogoCliente(id, await subirLogo(png), logoCliente.name);
      } catch (error) {
        console.error("[ofertas] el logo del cliente no se pudo guardar:", error);
        avisoLogo =
          "La oferta quedó normalizada, pero el logo del cliente no se pudo procesar. " +
          "Subilo de nuevo en la oferta, mejor como PNG.";
      }
    }

    return NextResponse.json({ id, inconsistencias, avisoLogo });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error("[ofertas] la lectura del borrador falló:", detalle);
    return NextResponse.json({ error: detalle }, { status: 500 });
  }
}
