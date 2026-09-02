"use server";

import { revalidatePath } from "next/cache";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { usuarioPuedeVerSubpanelFinanzas } from "@/lib/finanzas-subpaneles-usuario";
import { extraerFacturasSii, type ColumnasDelCsv } from "@/lib/sii-rcv";
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
  documentos: number;
  guardados: number;
  reclamos: number[];
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

  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    throw new Error(`"${periodo}" no es un período válido. Se espera AAAA-MM.`);
  }

  const creds = {
    rutRepresentante: process.env.SII_RUT_REPRESENTANTE ?? "",
    claveTributaria: process.env.SII_CLAVE_TRIBUTARIA ?? "",
    rutEmpresa: process.env.SII_RUT_EMPRESA ?? "",
  };
  if (!creds.rutRepresentante || !creds.claveTributaria || !creds.rutEmpresa) {
    throw new Error("Faltan las credenciales del SII en el entorno.");
  }

  try {
    const columnas = new Map<string, string[]>();
    const filas = await extraerFacturasSii(creds, {
      cargaInicial: false,
      // Período completo, sin filtro de día: se pide justamente para lo más viejo que la
      // ventana de la corrida diaria.
      periodos: [periodo],
      alLeerCsv: (info: ColumnasDelCsv) => {
        if (info.tipoDocumento === "venta") columnas.set("venta", info.columnas);
      },
    });

    // Antes de guardar: después ya no se puede saber si el reclamo es nuevo.
    const reclamos = await reclamosNuevosDeVenta(filas);
    const guardados = await guardarFacturasSii(filas);
    await registrarEjecucion(true, guardados);

    const aviso = avisoDeReclamos(reclamos);
    if (aviso) {
      // Si el correo falla, el dato ya está guardado y la pantalla lo muestra: se dice en
      // el log y la relectura no se deshace por eso.
      await enviarCorreoFinanzas(aviso.asunto, aviso.cuerpo).catch((error: unknown) => {
        const detalle = error instanceof Error ? error.message : String(error);
        console.error(`[finanzas] no se pudo avisar el reclamo a Finanzas: ${detalle}`);
      });
    }

    // Si hubo ventas y NINGUNA trajo estado, el CSV no tiene de donde derivarlo: se
    // devuelven sus columnas para poder mirarlo, en vez de decir "ninguna reclamada".
    const ventas = filas.filter((f) => f.tipoDocumento === "venta");
    const sinEstado =
      ventas.length > 0 && ventas.every((f) => f.estado === "registro" && !f.fechaAcuse && !f.fechaReclamo);

    revalidatePath("/finanzas/sii");
    return {
      periodo,
      documentos: filas.length,
      guardados,
      reclamos: reclamos.map((f) => f.folio),
      ...(sinEstado ? { columnasVenta: columnas.get("venta") ?? [] } : {}),
    };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    await registrarEjecucion(false, 0, mensaje).catch(() => {});
    throw new Error(mensaje);
  }
}
