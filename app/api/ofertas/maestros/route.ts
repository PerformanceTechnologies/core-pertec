import { NextResponse } from "next/server";
import { exigirAccesoOfertas } from "@/lib/ofertas/datos";
import { crearMaestro, subirArchivoMaestro } from "@/lib/ofertas/maestros";
import { leerMaestro } from "@/lib/ofertas/leer-maestro";
import { formatoDe } from "@/lib/cotizador/obra/formatos";
import { esEmpresaValida, type Empresa } from "@/lib/cotizador/empresas";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * Sube un maestro de formato y guarda su estilo.
 *
 * Se lee UNA vez. Los tokens quedan guardados y son editables a mano, así que el
 * formato de una oferta no depende nunca de volver a interpretar el archivo — es
 * lo que hace que dos ofertas del mismo maestro salgan idénticas.
 *
 * El archivo original va al bucket privado como respaldo y referencia visual.
 */
export async function POST(request: Request) {
  const usuario = await exigirAccesoOfertas();

  const formulario = await request.formData();
  const archivo = formulario.get("archivo");
  const empresaCruda = String(formulario.get("empresa") ?? "");

  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }
  if (!formatoDe(archivo.type, archivo.name)) {
    return NextResponse.json(
      { error: "El maestro tiene que ser un PDF, un Word (.docx) o un Excel (.xlsx)." },
      { status: 400 },
    );
  }
  // La empresa es opcional: un maestro puede servir a todas.
  const empresa: Empresa | null = esEmpresaValida(empresaCruda) ? empresaCruda : null;

  try {
    const contenido = Buffer.from(await archivo.arrayBuffer());
    const leido = await leerMaestro(contenido, archivo.type, archivo.name);
    // El archivo se guarda después de leerlo bien: si la lectura falla, no queda
    // un archivo huérfano en el bucket.
    const ruta = await subirArchivoMaestro(contenido, archivo.name);

    const id = await crearMaestro({
      nombre: leido.nombreSugerido,
      empresa,
      estilo: leido.estilo,
      descartados: [...leido.descartados, ...leido.noDistinguidos],
      archivoRuta: ruta,
      archivoNombre: archivo.name,
      creadoPor: usuario.id,
    });

    return NextResponse.json({
      id,
      nombre: leido.nombreSugerido,
      estilo: leido.estilo,
      descartados: leido.descartados,
      noDistinguidos: leido.noDistinguidos,
    });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error("[ofertas] la lectura del maestro falló:", detalle);
    return NextResponse.json({ error: detalle }, { status: 500 });
  }
}
