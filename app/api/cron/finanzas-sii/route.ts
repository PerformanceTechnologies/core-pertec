import { NextRequest, NextResponse } from "next/server";
import {
  extraerFacturasSii,
  hayColumnaDeEstadoDeVenta,
  type CamposDeApi,
  type PantallaDeVenta,
} from "@/lib/sii-rcv";
import { avisarReclamos } from "@/lib/finanzas-aviso";
import {
  guardarFacturasSii,
  marcarReclamosAvisados,
  olvidarAvisosDeReclamosRevertidos,
  reclamosSinAvisar,
  registrarEjecucion,
} from "@/lib/finanzas";
import { enviarCorreoSoporte } from "@/lib/notificaciones";
import { MESES_QUE_SE_RELEEN, ultimosPeriodos } from "@/lib/finanzas-periodos";

/**
 * Los cuatro meses tardan unos 80 segundos: login mas ~9 segundos por periodo (medido:
 * 14:06:16, :39, :48, :57 del 3/9/2026). El tope estaba en 60 con un comentario que decia
 * "limite del plan Hobby", y quedo viejo — la misma lectura de cuatro meses corrio desde
 * /finanzas/sii, que declara 300—. Con 60 el cron se cortaba en el tercer mes.
 *
 * Aun asi cada periodo se guarda al terminarlo (ver alTerminarPeriodo), asi que un tope
 * alcanzado no pierde lo leido: se pierde lo que faltaba, y lo toma la corrida siguiente.
 */
export const maxDuration = 300;

// Protegido por CRON_SECRET: Vercel Cron envia automaticamente
// "Authorization: Bearer <CRON_SECRET>" cuando esa variable de entorno
// existe. Tambien se puede invocar a mano (ej. para la carga inicial) con
// ese mismo header.
function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  return request.headers.get("authorization") === `Bearer ${secreto}`;
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const cargaInicial = request.nextUrl.searchParams.get("cargaInicial") === "true";

  // Por omision se releen los ultimos MESES_QUE_SE_RELEEN meses COMPLETOS, no una ventana
  // de dias. La ventana de 15 dias que habia antes alcanzaba para detectar un reclamo
  // —el cliente tiene 8 dias corridos— pero no para arreglar el pasado: cuando cambio
  // como se deriva el estado de una venta, todo lo mas viejo que la ventana quedo con el
  // dato anterior y nada lo volvia a mirar. Con los meses completos, un cambio de logica
  // se cura solo en la corrida siguiente.
  //
  // Se puede pedir otra cosa a mano: "?meses=6" son este mes y los cinco anteriores,
  // "?periodos=2026-07,2026-08" los que se pidan.
  const meses = Number(request.nextUrl.searchParams.get("meses") ?? MESES_QUE_SE_RELEEN);
  const pedidos = (request.nextUrl.searchParams.get("periodos") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => /^\d{4}-\d{2}$/.test(p));
  // Del mas viejo al mas nuevo (ver ultimosPeriodos): si el tope de tiempo corta el
  // recorrido, lo que queda al dia es lo que ninguna otra corrida vuelve a mirar.
  const cuantos = Number.isInteger(meses) && meses > 0 && meses <= 12 ? meses : MESES_QUE_SE_RELEEN;
  const periodos = pedidos.length ? pedidos : ultimosPeriodos(new Date(), cuantos);

  const creds = {
    rutRepresentante: process.env.SII_RUT_REPRESENTANTE ?? "",
    claveTributaria: process.env.SII_CLAVE_TRIBUTARIA ?? "",
    rutEmpresa: process.env.SII_RUT_EMPRESA ?? "",
  };
  if (!creds.rutRepresentante || !creds.claveTributaria || !creds.rutEmpresa) {
    const mensaje = "Faltan SII_RUT_REPRESENTANTE/SII_CLAVE_TRIBUTARIA/SII_RUT_EMPRESA en el entorno.";
    await registrarEjecucion(false, 0, mensaje);
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }

  try {
    // ventanaDias queda declarada por si algun dia se corre sin periodos: son 15 y no 7
    // porque el cliente tiene 8 dias corridos para reclamar, y con 7 un reclamo del octavo
    // dia caia justo afuera. Con `periodos` no se usa: los periodos se leen COMPLETOS, sin
    // filtro de dia (ver planDeLectura).
    //
    // El diagnostico: qué columnas trajo el CSV de ventas y qué muestra esa pestaña. Se
    // guarda SOLO si ninguna venta trajo estado (ver mas abajo). Es lo que faltaba cuando
    // el panel dijo "ninguna reclamada" y en realidad el SII no habia dicho nada.
    let csvVenta: string[] = [];
    let pantallaVenta: PantallaDeVenta | null = null;
    const camposApi: CamposDeApi[] = [];
    const filas = await extraerFacturasSii(creds, {
      cargaInicial,
      ventanaDias: 15,
      periodos,
      alLeerCsv: (info) => {
        if (info.tipoDocumento === "venta") csvVenta = info.columnas;
      },
      alMirarVenta: (info) => {
        pantallaVenta = info;
      },
      alVerJson: (info: CamposDeApi) => {
        camposApi.push(info);
      },
    });

    const nuevas = await guardarFacturasSii(filas);

    // Un reclamo que el cliente revirtio deja de contar como avisado: si vuelve a reclamar
    // la misma factura, es un hecho nuevo.
    await olvidarAvisosDeReclamosRevertidos();

    // DESPUES de guardar, y consultando la base: lo que decide a quien avisar es
    // `avisado_en` y no el estado. La primera version comparaba el estado leido contra el
    // guardado, asi que una factura quedaba marcada como reclamada aunque el correo
    // hubiera fallado y no se avisaba nunca mas.
    const reclamos = await reclamosSinAvisar();
    // Cuando el CSV de ventas no trae NINGUNA columna de estado: ese es el caso en que
    // el panel no puede saber. Que un mes no tenga reclamos no es una anomalia.
    const ventas = filas.filter((f) => f.tipoDocumento === "venta");
    const sinEstado = ventas.length > 0 && !hayColumnaDeEstadoDeVenta(csvVenta);

    // DESPUES de guardar: si el correo falla, el dato ya esta y el panel lo muestra. El
    // envio y su resultado los maneja avisarReclamos, el mismo que usa la relectura desde
    // la pantalla — antes cada uno hacia lo suyo y solo el cron avisaba a soporte.
    const envio = await avisarReclamos(reclamos);
    // El sello, SOLO si salio: asi un correo caido se reintenta solo manana.
    if (envio?.enviado) await marcarReclamosAvisados(reclamos);

    // Y la constancia va en la misma fila de la corrida: sin esto no habia forma de
    // contestar "salio el correo?" mas que mirando el buzon.
    await registrarEjecucion(true, nuevas, undefined, {
      aviso: envio ?? undefined,
      diagnostico: sinEstado ? { periodos, csvVenta, pantallaVenta, camposApi } : undefined,
    });

    return NextResponse.json({
      ok: true,
      documentos: filas.length,
      nuevos: nuevas,
      periodos,
      reclamosAvisados: reclamos.map((f) => f.folio),
      avisoEnviado: envio ? envio.enviado : null,
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    await registrarEjecucion(false, 0, mensaje).catch(() => {});
    await enviarCorreoSoporte(
      "Panel Finanzas: fallo la actualizacion diaria de facturas SII",
      `La corrida automatica de hoy no pudo actualizar las facturas del SII.\n\nError: ${mensaje}\n\nRevisa el dashboard en core.pertec.cl/finanzas y, si persiste, corre el scraper localmente para diagnosticar.`
    ).catch(() => {});
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
