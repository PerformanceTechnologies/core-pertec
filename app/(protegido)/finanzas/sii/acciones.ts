"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { usuarioPuedeVerSubpanelFinanzas } from "@/lib/finanzas-subpaneles-usuario";
import {
  extraerFacturasSii,
  hayColumnaDeEstadoDeVenta,
  type CamposDeApi,
  type FacturaSii,
  type ColumnasDelCsv,
  type PantallaDeVenta,
} from "@/lib/sii-rcv";
import {
  guardarFacturasSii,
  reclamosNuevosDeVenta,
  registrarEjecucion,
  ventasReclamadas,
} from "@/lib/finanzas";
import { avisarReclamos } from "@/lib/finanzas-aviso";
import { CORREO_FINANZAS } from "@/lib/notificaciones";

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
 * TODOS LOS PERÍODOS EN UNA LLAMADA, con un solo navegador y un solo login. Lo primero
 * que se intentó fue lo contrario —una llamada por mes desde el navegador— y no aguanta:
 * a partir del tercer Chromium la instancia de Vercel se queda sin recursos y el
 * navegador se muere antes de llegar al login ("ERR_INSUFFICIENT_RESOURCES", "Target
 * page, context or browser has been closed"). Reintentar desde el cliente no lo arregla,
 * porque la instancia sigue caliente. Un navegador para todos los meses no solo evita
 * eso: es más rápido, porque el login se hace una vez.
 *
 * El riesgo que esto trae es el tope de 300 s, y se cubre guardando MES POR MES
 * (alTerminarPeriodo): si se corta en el quinto, los cuatro anteriores ya están en la
 * base. Por eso los meses se leen del más viejo al más nuevo — el más viejo es el que la
 * corrida diaria no vuelve a mirar nunca.
 */

const SLUG_APP = "finanzas";

export interface ResultadoSincronizacion {
  /** Los períodos que se pidieron. */
  periodos: string[];
  /** Los que se alcanzaron a leer Y guardar. Puede ser menos, si se cortó por tiempo. */
  leidos: string[];
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
  /**
   * Si el aviso a Finanzas salió. null = no había nada que avisar.
   *
   * Se informa porque antes la pantalla decía "avisadas por correo a Finanzas" sin
   * saberlo: el envío va por Graph y su fallo se atrapaba en un console.error.
   */
  avisoEnviado?: boolean | null;
  /** Por qué no salió, si no salió. */
  avisoError?: string;
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

export async function sincronizarSiiAction(
  periodos: string[],
): Promise<ResultadoSincronizacion> {
  const usuario = await exigirAccesoApp(SLUG_APP);
  // El mismo permiso que para VER el subpanel: quien puede mirar las facturas puede
  // pedirle al SII que las relea. No es una escritura de negocio, es refrescar un espejo.
  if (usuario.rol !== "admin" && !(await usuarioPuedeVerSubpanelFinanzas(usuario.id, "sii"))) {
    throw new Error("No tenés acceso a las facturas del SII.");
  }

  // Del más viejo al más nuevo: si el tope de tiempo corta el recorrido, lo que queda al
  // día es lo más viejo, que es justo lo que la corrida diaria no vuelve a mirar.
  const pedidos = [...new Set(periodos)].filter((p) => /^\d{4}-\d{2}$/.test(p)).sort();
  const vacio = { periodos: pedidos, leidos: [], documentos: 0, guardados: 0, ventas: 0, reclamos: [] };
  if (pedidos.length === 0) {
    return { ...vacio, ok: false, error: "No se pidió ningún período válido (se espera AAAA-MM)." };
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
    let csvVenta: string[] = [];
    let pantalla: PantallaDeVenta | null = null;
    const camposApi: CamposDeApi[] = [];
    const leidos: string[] = [];
    const reclamos: FacturaSii[] = [];
    let documentos = 0;
    let guardados = 0;
    let ventas = 0;

    await extraerFacturasSii(creds, {
      cargaInicial: false,
      // Períodos completos, sin filtro de día: se piden justamente para lo más viejo que
      // la ventana de la corrida diaria (ver planDeLectura).
      periodos: pedidos,
      alLeerCsv: (info: ColumnasDelCsv) => {
        if (info.tipoDocumento === "venta") csvVenta = info.columnas;
      },
      alMirarVenta: (info: PantallaDeVenta) => {
        pantalla = info;
      },
      alVerJson: (info: CamposDeApi) => {
        camposApi.push(info);
      },
      // Cada mes se guarda al terminarlo: si el tope de tiempo corta el recorrido, lo
      // anterior ya está en la base y este resultado dice hasta dónde llegó.
      alTerminarPeriodo: async (periodo, filas) => {
        // Antes de guardar: después ya no se puede saber si el reclamo es nuevo.
        reclamos.push(...(await reclamosNuevosDeVenta(filas)));
        guardados += await guardarFacturasSii(filas);
        documentos += filas.length;
        ventas += filas.filter((f) => f.tipoDocumento === "venta").length;
        leidos.push(periodo);
      },
    });

    // El diagnóstico se guarda cuando el CSV no trae NINGUNA columna de estado, que es
    // el único caso en que el panel no puede saber. La primera versión lo disparaba
    // cuando ninguna venta traía estado, y eso dio la alarma al revés: septiembre tiene
    // una sola venta y no está reclamada, así que informó "el SII no dijo nada" cuando
    // las columnas estaban ahí y la respuesta era simplemente que no hay reclamos.
    const sinEstado = ventas > 0 && !hayColumnaDeEstadoDeVenta(csvVenta);

    // El aviso, ANTES de registrar la corrida: así el resultado del envío queda en la
    // misma fila. Sin esto no había forma de contestar "¿salió el correo?" —el fallo se
    // atrapaba en un console.error que se pierde con los logs de Vercel— y la pantalla
    // igual decía "avisadas por correo a Finanzas", supiera o no.
    const envio = await avisarReclamos(reclamos);

    await registrarEjecucion(true, guardados, undefined, {
      aviso: envio ?? undefined,
      diagnostico: sinEstado
        ? { periodos: pedidos, csvVenta, pantallaVenta: pantalla, camposApi }
        : undefined,
    });

    revalidatePath("/finanzas/sii");
    return {
      periodos: pedidos,
      leidos,
      ok: true,
      documentos,
      guardados,
      reclamos: reclamos.map((f) => f.folio),
      ventas,
      avisoEnviado: envio ? envio.enviado : null,
      ...(envio?.error ? { avisoError: envio.error } : {}),
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

export interface ResultadoReenvio {
  ok: boolean;
  folios: number[];
  destinatario: string;
  error?: string;
}

/**
 * Reenviar a Finanzas el aviso de las ventas que hoy figuran reclamadas.
 *
 * Existe porque el aviso automático NO se puede reintentar: manda solo los reclamos
 * NUEVOS —comparados contra lo guardado— y eso es lo correcto para que no llegue el mismo
 * correo todos los días. Pero significa que si el envío falla una vez, releer el período
 * ya no encuentra nada nuevo y el aviso se pierde para siempre. Pasó: se detectaron nueve
 * facturas reclamadas por $121 millones, la pantalla dijo "avisadas por correo" y a
 * finanzas@pertec.cl no llegó nada.
 *
 * Así que esto hace dos cosas con un solo botón: entrega la lista que Finanzas no recibió,
 * y —si vuelve a fallar— devuelve el error de Graph tal cual, que es lo único que permite
 * arreglarlo.
 *
 * El destinatario sigue siendo una constante de lib/notificaciones.ts: acá no se elige a
 * quién, solo cuándo.
 */
export async function reenviarAvisoReclamosAction(): Promise<ResultadoReenvio> {
  const usuario = await exigirAccesoApp(SLUG_APP);
  if (usuario.rol !== "admin" && !(await usuarioPuedeVerSubpanelFinanzas(usuario.id, "sii"))) {
    throw new Error("No tenés acceso a las facturas del SII.");
  }

  try {
    const reclamadas = await ventasReclamadas();
    const envio = await avisarReclamos(reclamadas);
    if (!envio) {
      return {
        ok: true,
        folios: [],
        destinatario: CORREO_FINANZAS,
        error: "No hay ventas reclamadas ni rechazadas: no había nada que avisar.",
      };
    }
    // Queda constancia igual que en una corrida, con 0 documentos: no se leyó nada del
    // SII, solo se reenvió. Así "¿salió el correo?" se contesta desde la base.
    await registrarEjecucion(true, 0, undefined, { aviso: envio });
    return {
      ok: envio.enviado,
      folios: envio.folios,
      destinatario: envio.destinatario,
      ...(envio.error ? { error: envio.error } : {}),
    };
  } catch (error) {
    // Como en sincronizarSiiAction: se devuelve, no se lanza. Una Server Action que lanza
    // llega al navegador enmascarada y el motivo hay que ir a buscarlo a la base.
    const detalle = error instanceof Error ? error.message : "Error desconocido";
    return { ok: false, folios: [], destinatario: CORREO_FINANZAS, error: detalle };
  }
}
