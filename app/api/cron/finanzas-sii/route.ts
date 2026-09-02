import { NextRequest, NextResponse } from "next/server";
import { extraerFacturasSii } from "@/lib/sii-rcv";
import { avisoDeReclamos } from "@/lib/finanzas-reclamos";
import { enviarCorreoFinanzas } from "@/lib/notificaciones";
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
    const filas = await extraerFacturasSii(creds, { cargaInicial, ventanaDias: 15 });

    // ANTES de guardar: despues ya no se puede saber si el reclamo es nuevo, y lo unico
    // que sirve avisar es lo nuevo — el reclamo se queda en el RCV hasta que el cliente lo
    // revierta, asi que sin esto cada corrida mandaria el mismo correo.
    const reclamos = await reclamosNuevosDeVenta(filas);

    const nuevas = await guardarFacturasSii(filas);
    await registrarEjecucion(true, nuevas);

    // Despues de guardar: si el correo falla, el dato ya esta y el panel lo muestra. El
    // fallo se avisa a soporte, que es quien puede hacer algo con eso.
    const aviso = avisoDeReclamos(reclamos);
    if (aviso) {
      await enviarCorreoFinanzas(aviso.asunto, aviso.cuerpo).catch(async (error: unknown) => {
        const detalle = error instanceof Error ? error.message : String(error);
        console.error(`[cron finanzas-sii] no se pudo avisar el reclamo a Finanzas: ${detalle}`);
        await enviarCorreoSoporte(
          "Panel Finanzas: se detecto una factura reclamada y el aviso no salio",
          `Se detectaron ${reclamos.length} factura(s) de venta reclamada(s) y el correo a ` +
            `finanzas@pertec.cl no se pudo enviar.\n\nError: ${detalle}\n\n${aviso.cuerpo}`,
        ).catch(() => {});
      });
    }

    return NextResponse.json({
      ok: true,
      documentos: filas.length,
      nuevos: nuevas,
      reclamosAvisados: reclamos.map((f) => f.folio),
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
