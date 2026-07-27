import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { obtenerCotizacion } from "@/lib/cotizador";
import { calcularCotizacion } from "@/lib/cotizador/motor/consolidacion";
import { generarEcoPdf } from "@/lib/cotizador/eco-pdf";

const SLUG_APP = "cotizador";

// Nombre de archivo seguro para Content-Disposition (sin tildes/símbolos que
// puedan romper el header en algunos navegadores).
function nombreArchivo(nombreCotizacion: string): string {
  const limpio = nombreCotizacion
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `ECO-1-${limpio || "cotizacion"}.pdf`;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoAppApi(SLUG_APP);
  if (!acceso.usuario) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }

  const { id } = await params;
  const cotizacion = await obtenerCotizacion(id);
  if (!cotizacion) {
    return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  }

  try {
    const result = calcularCotizacion(cotizacion.input, cotizacion.parametrosSnapshot);
    const preparadoPor = { nombre: acceso.usuario.nombre ?? acceso.usuario.correo, correo: acceso.usuario.correo };
    const pdf = await generarEcoPdf(cotizacion, result, preparadoPor);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nombreArchivo(cotizacion.nombre)}"`,
      },
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: `No se pudo generar el PDF: ${mensaje}` }, { status: 500 });
  }
}
