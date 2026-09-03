"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { usuarioPuedeVerSubpanelFinanzas } from "@/lib/finanzas-subpaneles-usuario";
import {
  extraerFacturasSii,
  hayColumnaDeEstadoDeVenta,
  type CamposDeApi,
  type ColumnasDelCsv,
  type PantallaDeVenta,
} from "@/lib/sii-rcv";
import { guardarFacturasSii, reclamosNuevosDeVenta, registrarEjecucion } from "@/lib/finanzas";
import { avisoDeReclamos } from "@/lib/finanzas-reclamos";
import { enviarCorreoFinanzas } from "@/lib/notificaciones";

/**
 * Sincronizar el SII a mano, desde la pantalla.
 *
 * Existe porque la corrida diaria no alcanza para todo: filtra por los últimos 15 días,
 * así que una factura más vieja que eso no se vuelve a consultar nunca y se queda con el
 * estado que tenía el día que se leyó. Cuando cambia cómo se deriva un estado —pasó con
 * el reclamo de las ventas— el historial entero queda con el dato viejo y hay que
 * releerlo período por período.
 *
 * Se podía hacer con la ruta del cron y el CRON_SECRET, pero eso obliga a pasear un
 * secreto por una terminal para una tarea de todos los días. Acá manda la sesión: mismo
 * guard que la pantalla.
 *
 * VIVE JUNTO A SU PÁGINA, y no en la carpeta de arriba, porque una Server Action se
 * empaqueta con la ruta que la importa: el Chromium del scraper hay que declararlo para
 * ESA ruta en outputFileTracingIncludes (ver next.config.ts), y con el archivo en
 * /finanzas la ruta a declarar no era evidente. Con el archivo acá, la ruta es la de esta
 * carpeta y no hay nada que adivinar.
 *
 * DE A UN PERÍODO, y no todos juntos: el scraper abre un navegador, se loguea y baja un
 * CSV por cada sub-pestaña, así que un período son minutos y la función tiene tope. Tres
 * períodos en una sola llamada se cortan a la mitad y no queda registro de qué alcanzó a
 * guardarse.
 */

const SLUG_APP = "finanzas";

export interface ResultadoSincronizacion {
  periodo: string;
  /**
   * Si la lectura salió. En false, mirar `error`; los contadores quedan en cero.
   *
   * Este resultado NO se lanza como excepción, y eso es a propósito: una Server Action
   * que lanza llega al navegador como "An error occurred in the Server Components
   * render. The specific message is omitted in production builds", sin decir qué pasó.
   * El mensaje real había que ir a buscarlo a finanzas_sii_ejecuciones. Que el SII se
   * caiga, tarde o mate el navegador es un resultado ESPERABLE de esto, no un bug del
   * programa: viaja como dato para que se pueda leer en pantalla y reintentar.
   */
  ok: boolean;
  /** Qué falló, en las palabras que dio el SII o Playwright. Vacío si salió bien. */
  error?: string;
  documentos: number;
  guardados: number;
  reclamos: number[];
  /** Cuántas ventas trajo ese período. Sin esto, "ninguna reclamada" no se puede leer. */
  ventas: number;
  /**
   * Las columnas del CSV de ventas, SOLO cuando ninguna venta trajo estado.
   *
   * Es la diferencia entre "no hay reclamadas" y "el SII no me dijo nada". La primera
   * version informaba lo primero cuando pasaba lo segundo, y el estado de todas las
   * ventas quedo en "Registro" sin que nada lo avisara. Van los nombres de columna,
   * nunca los valores.
   */
  columnasVenta?: string[];
}

export async function sincronizarSiiAction(periodo: string): Promise<ResultadoSincronizacion> {
  const usuario = await exigirAccesoApp(SLUG_APP);
  // El mismo permiso que para VER el subpanel: quien puede mirar las facturas puede
  // pedirle al SII que las relea. No es una escritura de negocio, es refrescar un espejo.
  if (usuario.rol !== "admin" && !(await usuarioPuedeVerSubpanelFinanzas(usuario.id, "sii"))) {
    throw new Error("No tenés acceso a las facturas del SII.");
  }

  const vacio = { periodo, documentos: 0, guardados: 0, ventas: 0, reclamos: [] };
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return { ...vacio, ok: false, error: `"${periodo}" no es un período válido. Se espera AAAA-MM.` };
  }

  const creds = {
    rutRepresentante: process.env.SII_RUT_REPRESENTANTE ?? "",
    claveTributaria: process.env.SII_CLAVE_TRIBUTARIA ?? "",
    rutEmpresa: process.env.SII_RUT_EMPRESA ?? "",
  };
  if (!creds.rutRepresentante || !creds.claveTributaria || !creds.rutEmpresa) {
    return { ...vacio, ok: false, error: "Faltan las credenciales del SII en el entorno." };
  }

  try {
    const columnas = new Map<string, string[]>();
    let pantalla: PantallaDeVenta | null = null;
    const camposApi: CamposDeApi[] = [];
    const filas = await extraerFacturasSii(creds, {
      cargaInicial: false,
      // Período completo, sin filtro de día: se pide justamente para lo más viejo que la
      // ventana de la corrida diaria.
      periodos: [periodo],
      alLeerCsv: (info: ColumnasDelCsv) => {
        if (info.tipoDocumento === "venta") columnas.set("venta", info.columnas);
      },
      alMirarVenta: (info: PantallaDeVenta) => {
        pantalla = info;
      },
      alVerJson: (info: CamposDeApi) => {
        camposApi.push(info);
      },
    });

    // Antes de guardar: después ya no se puede saber si el reclamo es nuevo.
    const reclamos = await reclamosNuevosDeVenta(filas);
    const guardados = await guardarFacturasSii(filas);

    // El diagnóstico se guarda cuando el CSV no trae NINGUNA columna de estado, que es
    // el único caso en que el panel no puede saber. La primera versión lo disparaba
    // cuando ninguna venta traía estado, y eso dio la alarma al revés: septiembre tiene
    // una sola venta y no está reclamada, así que informó "el SII no dijo nada" cuando
    // las columnas estaban ahí y la respuesta era simplemente que no hay reclamos.
    const ventas = filas.filter((f) => f.tipoDocumento === "venta");
    const csvVenta = columnas.get("venta") ?? [];
    const sinEstado = ventas.length > 0 && !hayColumnaDeEstadoDeVenta(csvVenta);
    await registrarEjecucion(
      true,
      guardados,
      undefined,
      sinEstado ? { periodo, csvVenta, pantallaVenta: pantalla, camposApi } : undefined,
    );

    const aviso = avisoDeReclamos(reclamos);
    if (aviso) {
      // Si el correo falla, el dato ya está guardado y la pantalla lo muestra: se dice en
      // el log y la relectura no se deshace por eso.
      await enviarCorreoFinanzas(aviso.asunto, aviso.cuerpo).catch((error: unknown) => {
        const detalle = error instanceof Error ? error.message : String(error);
        console.error(`[finanzas] no se pudo avisar el reclamo a Finanzas: ${detalle}`);
      });
    }

    revalidatePath("/finanzas/sii");
    return {
      periodo,
      ok: true,
      documentos: filas.length,
      guardados,
      reclamos: reclamos.map((f) => f.folio),
      ventas: ventas.length,
      ...(sinEstado ? { columnasVenta: csvVenta } : {}),
    };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    await registrarEjecucion(false, 0, mensaje).catch(() => {});
    // Se DEVUELVE, no se lanza: ver el comentario de `ok`. La primera versión lanzaba y
    // lo único que se veía en pantalla era el error genérico de Server Components; el
    // motivo —"Target page, context or browser has been closed", el Chromium que se muere
    // cuando la instancia ya lanzó dos— solo aparecía consultando la base.
    return { ...vacio, ok: false, error: mensaje };
  }
}
