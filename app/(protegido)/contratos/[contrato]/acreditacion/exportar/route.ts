import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { cargarNomina } from "@/lib/contratos/acreditacion";
import { generarExcel } from "@/lib/contratos/acreditacion-excel";
import { generarResumenCompleto } from "@/lib/contratos/acreditacion-resumen-excel";
import { listarFacturas } from "@/lib/contratos/capacitaciones-gastos";
import { TIPO_XLSX, nombreDeArchivo } from "@/lib/contratos/excel-comun";

export const dynamic = "force-dynamic";

/**
 * Descarga la nómina como Excel.
 *
 * Sin parámetros: la nómina (la matriz de documentos, como siempre). Con `?resumen=1`: el RESUMEN
 * COMPLETO, con portada, cursos y exámenes, vencimientos, documentos y dotación.
 *
 * El acceso se comprueba AQUÍ y no solo escondiendo el enlace: un Route Handler es
 * una URL, y se puede pedir directo. Es la misma regla que en cada Server Action.
 *
 * Los datos bancarios y previsionales salen solo si quien descarga es
 * administrador. El archivo viaja por correo; quién decide a quién se le manda una
 * cuenta corriente no se resuelve con un parámetro en la URL.
 */
export async function GET(request: Request) {
  const usuario = await exigirAccesoApp("acreditacion");
  const parametros = new URL(request.url).searchParams;
  const incluirDatos = parametros.get("datos") === "1";
  const resumen = parametros.get("resumen") === "1";

  const { contrato, tipos, cargos, personas, hoy } = await cargarNomina();

  // Las bajas no van en lo que se manda: son historial, no equipo.
  const activas = personas.filter((p) => p.persona.activo);
  const comunes = {
    contrato,
    tipos,
    personas: activas,
    hoy,
    incluirDatos,
    incluirBancarios: incluirDatos && usuario.rol === "admin",
  };

  let buffer: Buffer;
  if (resumen) {
    // Las facturas son líneas de Gastos de arranque; si no se pueden leer, el resumen sale igual y
    // sin esas columnas (el archivo no puede depender de que Gastos responda).
    const facturas = await listarFacturas(
      activas.flatMap((p) => p.cursos.flatMap((c) => (c.partidaGastoId ? [c.partidaGastoId] : []))),
    ).catch((e) => {
      console.error("[acreditacion] No se pudieron leer las facturas para el Excel:", e);
      return new Map();
    });
    buffer = await generarResumenCompleto({ ...comunes, cargos, bajas: personas.length - activas.length, facturas });
  } else {
    buffer = await generarExcel(comunes);
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": TIPO_XLSX,
      // El nombre en ASCII: viaja en una cabecera HTTP, donde un acento o una eñe se rompen.
      "Content-Disposition": `attachment; filename="${nombreDeArchivo(
        `${resumen ? "Resumen-acreditacion-personas" : "Nomina-acreditacion"}-${contrato.nombre}`,
        hoy,
      )}"`,
      // Datos de personas: que ningún intermediario los guarde.
      "Cache-Control": "no-store",
    },
  });
}
