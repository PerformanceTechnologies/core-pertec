import { NextResponse } from "next/server";
import { exigirAccesoOfertas, guardarLogoCliente, obtenerOferta } from "@/lib/ofertas/datos";
import { guardarLogoEmpresa, obtenerEmpresaPorNombre } from "@/lib/cotizador/empresas-datos";
import { esEmpresaValida } from "@/lib/cotizador/empresas";
import { esFormatoDeLogo, LIMITE_SUBIDA_LOGO } from "@/lib/ofertas/logo";
import { borrarLogo, normalizarLogo, subirLogo, urlFirmadaLogo } from "@/lib/ofertas/logos-archivo";

export const runtime = "nodejs";
// Solo hay que abrir una imagen y escalarla: no se parece al análisis de un
// borrador, que espera a un modelo.
export const maxDuration = 30;

/**
 * Subir y quitar los logos de los documentos.
 *
 * Va por una route handler y no por una server action porque las actions cortan el
 * cuerpo del request en 1 MB, y el logo que alguien tiene a mano suele ser el del
 * manual de marca, en grande. Acá el tope es 4 MB y lo que se guarda es el PNG
 * normalizado, así que el archivo pesado no llega a la base ni al PDF.
 *
 * Dos destinos, que no son lo mismo:
 *
 *  - `empresa`: el logo de la empresa emisora. Se sube una vez y sale en todas sus
 *    ofertas. Es identidad de la empresa, así que vive con su razón social y su
 *    RUT, no con el formato.
 *  - `cliente`: el logo del cliente de UNA oferta, que es el hueco que la maqueta
 *    ya tenía rotulado "[Logo cliente]".
 */

/** A dónde va el logo: qué había antes y cómo se guarda el nuevo. */
interface Destino {
  rutaActual: string | null;
  guardar: (ruta: string | null, nombre: string | null) => Promise<void>;
}

async function resolverDestino(
  destino: string,
  clave: string,
): Promise<{ destino: Destino } | { error: string; estado: number }> {
  if (destino === "empresa") {
    if (!esEmpresaValida(clave)) {
      return { error: `"${clave}" no es una de las empresas del sistema.`, estado: 400 };
    }
    const empresa = await obtenerEmpresaPorNombre(clave);
    if (!empresa) {
      return {
        error: `No está cargada la identidad de "${clave}". Cargala en /cotizador/empresas primero.`,
        estado: 404,
      };
    }
    return {
      destino: {
        rutaActual: empresa.logoRuta,
        guardar: (ruta, nombre) => guardarLogoEmpresa(clave, ruta, nombre),
      },
    };
  }

  if (destino === "cliente") {
    const oferta = await obtenerOferta(clave);
    if (!oferta) return { error: "La oferta no existe.", estado: 404 };
    // Igual que el maestro: una emitida ya salió con un formato y una marca, y
    // cambiárselos dejaría el registro diciendo algo distinto de lo que recibió el
    // cliente.
    if (oferta.estado === "emitida") {
      return { error: "La oferta ya está emitida: su logo no se cambia.", estado: 409 };
    }
    return {
      destino: {
        rutaActual: oferta.logoClienteRuta,
        guardar: (ruta, nombre) => guardarLogoCliente(clave, ruta, nombre),
      },
    };
  }

  return { error: "Destino desconocido.", estado: 400 };
}

export async function POST(request: Request) {
  await exigirAccesoOfertas();

  const formulario = await request.formData();
  const archivo = formulario.get("archivo");
  const resuelto = await resolverDestino(
    String(formulario.get("destino") ?? ""),
    String(formulario.get("clave") ?? ""),
  );
  if ("error" in resuelto) {
    return NextResponse.json({ error: resuelto.error }, { status: resuelto.estado });
  }

  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }
  if (!esFormatoDeLogo(archivo.type, archivo.name)) {
    return NextResponse.json(
      { error: "El logo tiene que ser un PNG, un JPG, un WEBP o un SVG." },
      { status: 400 },
    );
  }
  if (archivo.size > LIMITE_SUBIDA_LOGO) {
    const mb = (archivo.size / 1024 / 1024).toFixed(1);
    return NextResponse.json(
      { error: `El archivo pesa ${mb} MB y el tope es 4 MB. Exportalo más chico.` },
      { status: 400 },
    );
  }

  try {
    const png = await normalizarLogo(Buffer.from(await archivo.arrayBuffer()));
    const ruta = await subirLogo(png);
    // El nuevo se guarda antes de borrar el viejo: al revés, un fallo al guardar
    // dejaría al documento sin ningún logo.
    await resuelto.destino.guardar(ruta, archivo.name);
    await borrarLogo(resuelto.destino.rutaActual);

    return NextResponse.json({
      nombre: archivo.name,
      url: await urlFirmadaLogo(ruta),
      bytes: png.length,
    });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error("[ofertas] el logo no se pudo procesar:", detalle);
    return NextResponse.json(
      { error: "No se pudo leer la imagen. Probá con un PNG exportado de nuevo." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  await exigirAccesoOfertas();

  const parametros = new URL(request.url).searchParams;
  const resuelto = await resolverDestino(
    String(parametros.get("destino") ?? ""),
    String(parametros.get("clave") ?? ""),
  );
  if ("error" in resuelto) {
    return NextResponse.json({ error: resuelto.error }, { status: resuelto.estado });
  }

  // La fila primero: si se borra el archivo y falla el update, queda una ruta
  // apuntando a un archivo que no existe y el encabezado sale vacío.
  await resuelto.destino.guardar(null, null);
  await borrarLogo(resuelto.destino.rutaActual);
  return NextResponse.json({ quitado: true });
}
