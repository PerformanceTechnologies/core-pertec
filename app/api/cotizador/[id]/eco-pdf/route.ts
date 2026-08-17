import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { esObra, obtenerCotizacion } from "@/lib/cotizador";
import { calcularCotizacion } from "@/lib/cotizador/motor/consolidacion";
import { generarEcoPdf } from "@/lib/cotizador/eco-pdf";
import { obtenerEmpresaPorNombre } from "@/lib/cotizador/empresas-datos";

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

  // El ECO-1 en PDF es el formato de las cotizaciones mensuales. Una obra tiene
  // otra estructura (turnos, HH, ítems traspasados) y su PDF está pendiente:
  // mejor decirlo que devolver un documento con los campos en blanco.
  const { input } = cotizacion;
  if (esObra(input)) {
    return NextResponse.json(
      { error: "El PDF del ECO todavía no está disponible para las cotizaciones de obra." },
      { status: 501 },
    );
  }

  try {
    const result = calcularCotizacion(input, cotizacion.parametrosSnapshot);
    const preparadoPor = {
      nombre: acceso.usuario.nombre ?? acceso.usuario.correo,
      correo: acceso.usuario.correo,
    };
    // Identidad legal de la empresa emisora, para el encabezado del PDF.
    const empresa = await obtenerEmpresaPorNombre(cotizacion.empresa);
    const pdf = await generarEcoPdf({ ...cotizacion, input }, result, preparadoPor, empresa);

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
