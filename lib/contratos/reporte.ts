import "server-only";
import { aplicacionesVisibles, listarAplicaciones } from "./aplicaciones";
import { contratoActual } from "./contrato-actual";
import { leerLogo } from "./contratos";
import { hoyEnChile } from "./acreditacion-modelo";
import { MODULOS } from "./arranque-modelo";
import {
  cargarAcreditacion,
  cargarArranque,
  cargarContrato,
  cargarDocumentos,
  cargarPlazos,
  cargarResponsables,
  cargarVehiculos,
} from "./dashboard";
import {
  armarModulos,
  avanceGeneral,
  reunirAtencion,
  saludDelContrato,
  textoDeInicio,
  type DatosDelTablero,
  type DocumentosDelTablero,
} from "./dashboard-modelo";
import type { DatosDelReporte } from "./reporte-pdf";
import type { UsuarioConAcceso } from "./tipos";

/** Una lectura que falla no puede tumbar el reporte: ese módulo sale con una nota, no el documento. */
async function segura<T>(promesa: Promise<T>, que: string): Promise<T | null> {
  try {
    return await promesa;
  } catch (e) {
    console.error(`[reporte] ${que}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/**
 * Los datos del reporte del contrato, para quien lo pide.
 *
 * Es la misma lectura y el mismo cálculo que el tablero: un reporte que dijera 47% donde el tablero
 * dice 49% sería peor que no tenerlo. Y como en el tablero, solo entran los módulos que esa persona
 * puede abrir: el PDF sale del core y viaja por correo, y un resumen de lo que no puede ver sería
 * una forma de filtrar datos que el resto del core le niega.
 */
export async function armarReporte(usuario: UsuarioConAcceso): Promise<DatosDelReporte> {
  const apps = aplicacionesVisibles(usuario, await listarAplicaciones());
  const tiene = new Set(apps.map((a) => a.slug));
  const hoy = hoyEnChile();

  const [contrato, plazos, responsables, documentos, acreditacion, vehiculos, logistica, gastos] = await Promise.all([
    cargarContrato().catch(() => ({ nombre: "Contrato", fechaInicio: null, administrador: null })),
    cargarPlazos(hoy).catch(() => ({})),
    cargarResponsables().catch(() => ({})),
    tiene.has("contratos") ? segura(cargarDocumentos(usuario.correo), "documentos generales") : Promise.resolve(null),
    tiene.has("acreditacion") ? segura(cargarAcreditacion(), "acreditación") : Promise.resolve(null),
    tiene.has("acreditacion-vehiculos") ? segura(cargarVehiculos(), "vehículos") : Promise.resolve(null),
    tiene.has(MODULOS.logistica.appSlug) ? segura(cargarArranque("logistica"), "logística") : Promise.resolve(null),
    tiene.has(MODULOS.gastos.appSlug) ? segura(cargarArranque("gastos"), "gastos") : Promise.resolve(null),
  ]);

  // Documentos generales puede fallar sin que el resto cambie: se dice en su página.
  const docs: DocumentosDelTablero | null = tiene.has("contratos")
    ? (documentos ?? { estado: "error", mensaje: "No se pudo leer SharePoint." })
    : null;

  const datos: DatosDelTablero = { documentos: docs, acreditacion, vehiculos, logistica, gastos };
  const modulos = armarModulos(datos, plazos, responsables);
  const general = avanceGeneral(modulos);
  const atenciones = reunirAtencion({ modulos, acreditacion, vehiculos, logistica, gastos, limite: Infinity });

  return {
    // El cliente va en el encabezado de cada página del PDF (en core-ih era el logo de Codelco).
    contrato: { ...contrato, cliente: (await contratoActual()).cliente },
    logo: await leerLogo((await contratoActual()).slug).catch(() => null),
    hoy,
    generadoPor: usuario.nombre || usuario.correo,
    inicio: textoDeInicio(contrato.fechaInicio, hoy),
    general,
    salud: saludDelContrato(atenciones, general.medidos),
    modulos,
    atenciones,
    documentos: docs,
    acreditacion,
    vehiculos,
    logistica,
    gastos,
  };
}
