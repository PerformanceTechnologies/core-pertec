import { NextResponse } from "next/server";
import { crearCotizacionImportada, exigirAccesoCotizador } from "@/lib/cotizador";
import { listarCatalogoCargos } from "@/lib/cotizador/catalogo-cargos";
import { obtenerSetVigente } from "@/lib/parametros-legales";
import { construirObra, leerPropuesta } from "@/lib/cotizador/obra/importar";
import { esEmpresaValida, type Empresa } from "@/lib/cotizador/empresas";

export const runtime = "nodejs";
// Leer una propuesta completa con el modelo tarda bastante más que una boleta.
export const maxDuration = 60;

/**
 * Importa una propuesta en PDF y la deja cargada como obra, cuadrada.
 *
 * Va por route handler y no por Server Action porque una propuesta pesa varios
 * MB y el body de una Server Action está limitado a 1 MB por defecto.
 *
 * Requiere permiso de CREAR cotización, no solo de verlas: esto escribe.
 */
export async function POST(request: Request) {
  const { usuario } = await exigirAccesoCotizador("crear_cotizacion");

  const formulario = await request.formData();
  const archivo = formulario.get("archivo");
  const empresaCruda = String(formulario.get("empresa") ?? "");

  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }
  if (archivo.type !== "application/pdf") {
    return NextResponse.json({ error: "La propuesta tiene que ser un PDF." }, { status: 400 });
  }
  if (!esEmpresaValida(empresaCruda)) {
    return NextResponse.json({ error: "Empresa emisora no válida." }, { status: 400 });
  }
  const empresa: Empresa = empresaCruda;

  const set = await obtenerSetVigente();
  if (!set) {
    return NextResponse.json(
      { error: "No hay un set de parámetros legales vigente. Créalo antes de importar." },
      { status: 409 },
    );
  }

  try {
    const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");
    const propuesta = await leerPropuesta(base64, archivo.type, archivo.name);
    const catalogo = await listarCatalogoCargos();
    const { obra, avisos, verificacion } = construirObra(propuesta, catalogo, set.valores);

    const cotizacion = await crearCotizacionImportada(
      {
        nombre: [propuesta.numeroOferta, propuesta.descripcionServicio]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 160),
        empresa,
        cliente: propuesta.cliente,
        faena: propuesta.faena,
        obra,
      },
      set,
      usuario.id,
    );

    return NextResponse.json({ id: cotizacion.id, avisos, verificacion });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error("[cotizador] importación de propuesta falló:", detalle);
    return NextResponse.json({ error: detalle }, { status: 500 });
  }
}
