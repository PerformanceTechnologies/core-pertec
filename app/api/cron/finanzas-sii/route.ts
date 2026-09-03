import { NextRequest, NextResponse } from "next/server";
import {
  extraerFacturasSii,
  hayColumnaDeEstadoDeVenta,
  type CamposDeApi,
  type PantallaDeVenta,
} from "@/lib/sii-rcv";
import { avisarReclamos } from "@/lib/finanzas-aviso";
import { guardarFacturasSii, reclamosNuevosDeVenta, registrarEjecucion } from "@/lib/finanzas";
import { enviarCorreoSoporte } from "@/lib/notificaciones";

export const maxDuration = 60; // limite del plan Hobby de Vercel

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

  // Releer periodos completos, a mano: "?meses=3" son este mes y los dos anteriores,
  // "?periodos=2026-07,2026-08" los que se pidan. Sin filtro de dia.
  //
  // Hace falta porque la corrida diaria solo mira los ultimos 15 dias: una factura mas
  // vieja que eso nunca se vuelve a consultar y se queda con el estado que tenia el dia
  // que se leyo. Al cambiar como se deriva el estado de una venta, todo el historial
  // quedo con el dato viejo —"registro" en cada una— y no habia forma de actualizarlo
  // sin esto.
  const meses = Number(request.nextUrl.searchParams.get("meses") ?? "0");
  const pedidos = (request.nextUrl.searchParams.get("periodos") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => /^\d{4}-\d{2}$/.test(p));
  const periodos = pedidos.length
    ? pedidos
    : Number.isInteger(meses) && meses > 0 && meses <= 12
      ? Array.from({ length: meses }, (_, i) => {
          const d = new Date();
          d.setDate(1);
          d.setMonth(d.getMonth() - i);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        })
      : [];

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
    // 15 dias: el cliente tiene 8 corridos para reclamar una factura de venta, asi que
    // con la ventana de 7 que habia un reclamo del octavo dia caia afuera y el panel se
    // quedaba con el estado viejo.
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

    // ANTES de guardar: despues ya no se puede saber si el reclamo es nuevo, y lo unico
    // que sirve avisar es lo nuevo — el reclamo se queda en el RCV hasta que el cliente lo
    // revierta, asi que sin esto cada corrida mandaria el mismo correo.
    const reclamos = await reclamosNuevosDeVenta(filas);

    const nuevas = await guardarFacturasSii(filas);
    // Cuando el CSV de ventas no trae NINGUNA columna de estado: ese es el caso en que
    // el panel no puede saber. Que un mes no tenga reclamos no es una anomalia.
    const ventas = filas.filter((f) => f.tipoDocumento === "venta");
    const sinEstado = ventas.length > 0 && !hayColumnaDeEstadoDeVenta(csvVenta);

    // DESPUES de guardar: si el correo falla, el dato ya esta y el panel lo muestra. El
    // envio y su resultado los maneja avisarReclamos, el mismo que usa la relectura desde
    // la pantalla — antes cada uno hacia lo suyo y solo el cron avisaba a soporte.
    const envio = await avisarReclamos(reclamos);

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
      periodos: periodos.length ? periodos : "ventana de 15 días",
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
