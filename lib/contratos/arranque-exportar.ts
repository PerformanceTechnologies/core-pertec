import "server-only";
import { exigirAccesoApp } from "./autorizacion";
import { hoyEnChile } from "./acreditacion-modelo";
import { listarCategorias, listarPartidas } from "./arranque";
import { generarExcelDeArranque } from "./arranque-excel";
import { MODULOS, type ModuloArranque } from "./arranque-modelo";
import { cargarContrato } from "./dashboard";
import { nombreDeArchivo, TIPO_XLSX } from "./excel-comun";
import { cargarResumenDePresupuesto, listarCambiosDePresupuesto, listarCotizacionesDeGastos } from "./gastos";
import { listarResponsables } from "./responsables";

/**
 * La descarga de Excel de Logística o de Gastos de arranque.
 *
 * El acceso se comprueba AQUÍ y no solo escondiendo el botón: un Route Handler es una URL y se puede
 * pedir directo. Es la misma regla que en cada Server Action. Gastos habla de plata, y quien lo
 * descarga ya tiene el módulo asignado (que se asigna aparte del de Logística).
 */
export async function respuestaDeExcel(modulo: ModuloArranque): Promise<Response> {
  await exigirAccesoApp(MODULOS[modulo].appSlug);

  const hoy = hoyEnChile();
  const [contrato, partidas, categorias, responsables] = await Promise.all([
    cargarContrato().catch(() => ({ nombre: "Contrato" })),
    listarPartidas(modulo),
    listarCategorias(modulo, { incluirInactivas: true }),
    listarResponsables(),
  ]);

  const nombres = new Map([...responsables.internos, ...responsables.externos].map((p) => [p.id, p.nombre]));

  // Para el vínculo («Despacho a Calama») hace falta tener las partidas del otro módulo a mano.
  const delOtro = await listarPartidas(modulo === "gastos" ? "logistica" : "gastos");

  const gastos =
    modulo === "gastos"
      ? await Promise.all([cargarResumenDePresupuesto(), listarCotizacionesDeGastos(), listarCambiosDePresupuesto(20)]).then(
          ([presupuesto, cotizaciones, cambios]) => ({ presupuesto, cotizaciones, cambios }),
        )
      : undefined;

  const buffer = await generarExcelDeArranque({
    modulo,
    contrato: contrato.nombre,
    hoy,
    partidas,
    categorias,
    responsables: nombres,
    gastos,
    otras: delOtro,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": TIPO_XLSX,
      "Content-Disposition": `attachment; filename="${nombreDeArchivo(`${MODULOS[modulo].titulo}-${contrato.nombre}`, hoy)}"`,
      // Plata y proveedores: que ningún intermediario lo guarde.
      "Cache-Control": "no-store",
    },
  });
}
