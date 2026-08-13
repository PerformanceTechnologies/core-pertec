import "server-only";
import { extraerDocumentosIhRcv, type EmpresaIhConfig } from "./sii-rcv-ih";
import { extraerGuiasYCodigosIh } from "./sii-guias-ih";
import { extraerBoletasHonorariosIh } from "./sii-bhe-ih";
import { claveDocumento } from "./claves";
import {
  guardarDocumentosIh,
  registrarEjecucionIh,
  listarClavesYaRespaldadasIh,
  actualizarRespaldosPorClaveIh,
} from "./finanzas-ih";

// Punto unico de sincronizacion, compartido por el cron diario
// (app/api/cron/finanzas-ih/route.ts) y el boton "Actualizar ahora" de la UI
// -- ambos deben hacer exactamente lo mismo, solo cambia quien los dispara.
//
// Cubre: factura afecta/exenta y notas de credito/debito (RCV), guias de
// despacho y boletas 39/41 (Portal MIPYME), y boletas de honorarios
// recibidas por IH (sistema separado del SII, ver sii-bhe-ih.ts) -- con
// respaldo de XML (emitidos) / PDF (recibidos) a SharePoint hecho EN LINEA
// durante el scraping (ver sii-guias-ih.ts) -- acotado por corrida para no
// exceder maxDuration=60s de Vercel Hobby, se pone al dia de a poco.
export async function sincronizarFinanzasIh(opciones: { cargaInicial: boolean }): Promise<{
  documentos: number;
  nuevos: number;
  archivosSubidos: number;
}> {
  const creds = {
    rutRepresentante: process.env.SII_RUT_REPRESENTANTE ?? "",
    claveTributaria: process.env.SII_CLAVE_TRIBUTARIA ?? "",
  };
  const empresas: EmpresaIhConfig[] = [
    { empresa: "IH", rutEmpresa: process.env.SII_RUT_EMPRESA_IH ?? "" },
    { empresa: "IL", rutEmpresa: process.env.SII_RUT_EMPRESA_IL ?? "" },
  ];

  if (!creds.rutRepresentante || !creds.claveTributaria) {
    throw new Error("Faltan SII_RUT_REPRESENTANTE/SII_CLAVE_TRIBUTARIA en el entorno.");
  }
  const empresaSinRut = empresas.find((e) => !e.rutEmpresa);
  if (empresaSinRut) {
    throw new Error(`Falta SII_RUT_EMPRESA_${empresaSinRut.empresa} en el entorno.`);
  }

  try {
    const yaRespaldados = await listarClavesYaRespaldadasIh();

    // Secuencial, no en paralelo: son sesiones de login independientes
    // contra el SII con la misma cuenta, y el SII puede invalidar una sesion
    // activa si detecta otra concurrente del mismo representante.
    const documentosRcv = await extraerDocumentosIhRcv(creds, empresas, { cargaInicial: opciones.cargaInicial, ventanaDias: 7 });
    const { documentos: documentosGuias, codigosEmitidos, codigosRecibidos, respaldos } = await extraerGuiasYCodigosIh(
      creds,
      empresas,
      // limiteRespaldo bajo a proposito: cada intento hace 2-3 requests
      // reales al SII (lentos) mas una subida a Graph, y maxDuration=60s en
      // Vercel Hobby -- mejor ponerse al dia de a poco en varias corridas
      // que arriesgar timeout en una sola.
      { cargaInicial: opciones.cargaInicial, ventanaDias: 7, yaRespaldados, limiteRespaldo: 5 }
    );

    // El RCV no trae el codigo del portal MIPYME: se completa matcheando
    // por (folio, rut contraparte) con lo que devolvio extraerGuiasYCodigosIh
    // en la MISMA corrida.
    for (const doc of documentosRcv) {
      const clave = claveDocumento(doc.folio, doc.rutContraparte);
      doc.codigoPortal = (doc.direccion === "venta" ? codigosEmitidos.get(clave) : codigosRecibidos.get(clave)) ?? null;
    }

    // Sesion de login totalmente distinta (RUT/clave propios de IH, no el
    // representante) -- secuencial despues de las de arriba por el mismo
    // motivo (no concurrir sesiones del SII). No lanza si falta
    // SII_CLAVE_EMPRESA_IH: extraerBoletasHonorariosIh devuelve vacio.
    const { documentos: documentosBhe, respaldos: respaldosBhe } = await extraerBoletasHonorariosIh({
      cargaInicial: opciones.cargaInicial,
      yaRespaldados,
      limiteRespaldo: 5,
    });

    const documentos = [...documentosRcv, ...documentosGuias, ...documentosBhe];
    const nuevos = await guardarDocumentosIh(documentos);
    const archivosSubidos =
      (await actualizarRespaldosPorClaveIh(respaldos)) + (await actualizarRespaldosPorClaveIh(respaldosBhe));

    await registrarEjecucionIh(true, nuevos, archivosSubidos);
    return { documentos: documentos.length, nuevos, archivosSubidos };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    await registrarEjecucionIh(false, 0, 0, mensaje).catch(() => {});
    throw err;
  }
}
