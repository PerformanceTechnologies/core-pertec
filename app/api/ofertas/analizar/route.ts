import { NextResponse } from "next/server";
import { crearOferta, exigirAccesoOfertas } from "@/lib/ofertas/datos";
import { leerBorrador } from "@/lib/ofertas/leer";
import { formatoDe } from "@/lib/cotizador/obra/formatos";
import { esEmpresaValida, type Empresa } from "@/lib/cotizador/empresas";

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
      { error: "El borrador tiene que ser un Word (.docx), un PDF o un Excel (.xlsx, .xlsm)." },
      { status: 400 },
    );
  }
  if (!esEmpresaValida(empresaCruda)) {
    return NextResponse.json({ error: "Empresa emisora no válida." }, { status: 400 });
  }
  const empresa: Empresa = empresaCruda;

  try {
    const contenido = await leerBorrador(
      Buffer.from(await archivo.arrayBuffer()),
      archivo.type,
      archivo.name,
    );
    const { id, inconsistencias } = await crearOferta(contenido, empresa, archivo.name, usuario.id);
    return NextResponse.json({ id, inconsistencias });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error("[ofertas] la lectura del borrador falló:", detalle);
    return NextResponse.json({ error: detalle }, { status: 500 });
  }
}
