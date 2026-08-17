import { NextResponse } from "next/server";
import { crearCotizacionImportada, exigirAccesoCotizador } from "@/lib/cotizador";
import { listarCatalogoCargos } from "@/lib/cotizador/catalogo-cargos";
import { obtenerSetVigente } from "@/lib/parametros-legales";
import { construirObra, leerPropuesta } from "@/lib/cotizador/obra/importar";
import { esEmpresaValida, type Empresa } from "@/lib/cotizador/empresas";
import { nombreDeCotizacionImportada } from "@/lib/cotizador/nombre-cotizacion";
import { formatoDe } from "@/lib/cotizador/obra/extraer-texto";

export const runtime = "nodejs";
// Leer una propuesta completa con el modelo tarda bastante más que una boleta.
export const maxDuration = 60;

/**
 * Importa una propuesta (PDF, Excel o Word) y la deja cargada como obra, cuadrada.
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
  // El formato se valida acá y no solo en el navegador: el `accept` del input es
  // una comodidad, no una validación. Se acepta por MIME o por extensión porque
  // Windows manda a veces application/octet-stream para un .xlsx.
  if (!formatoDe(archivo.type, archivo.name)) {
    return NextResponse.json(
      { error: "La propuesta tiene que ser un PDF, un Excel (.xlsx, .xlsm) o un Word (.docx)." },
      { status: 400 },
    );
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
    const propuesta = await leerPropuesta(
      Buffer.from(await archivo.arrayBuffer()),
      archivo.type,
      archivo.name,
    );
    const catalogo = await listarCatalogoCargos();
    const { obra, avisos, verificacion } = construirObra(propuesta, catalogo, set.valores);

    const cotizacion = await crearCotizacionImportada(
      {
        // Las reglas de nombre viven en un solo lugar (lib/cotizador/
        // nombre-cotizacion.ts): mayúsculas, acotado a 70 y sin el relleno del
        // título del PDF.
        nombre: nombreDeCotizacionImportada(propuesta.numeroOferta, propuesta.descripcionServicio),
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
