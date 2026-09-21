import "server-only";
import { extraerDocumentosIhRcv, type DocumentoIh, type EmpresaIhConfig } from "./sii-rcv-ih";
import { extraerGuiasYCodigosIh } from "./sii-guias-ih";
import { extraerBoletasHonorariosIh } from "./sii-bhe-ih";
import { claveDocumento } from "./claves";
import {
  guardarDocumentosIh,
  registrarEjecucionIh,
  listarClavesYaRespaldadasIh,
  actualizarRespaldosPorClaveIh,
  type RespaldoDocumento,
} from "./finanzas-ih";

// Sincronizacion de factura/nota/guia/boleta (RCV + Portal MIPYME),
// compartida por el cron diario (app/api/cron/finanzas-ih/route.ts) y el
// boton "Actualizar ahora" de la UI. La BHE de IH (sii-bhe-ih.ts) se
// sincroniza APARTE, ver sincronizarBoletasHonorariosIh mas abajo -- iba
// todo junto originalmente, pero sumar los pasadas dedicadas de boletas
// 39/41 (ver sii-guias-ih.ts) MAS el login separado de BHE hizo que una
// corrida completa superara los 60s de maxDuration del plan Hobby de
// Vercel (FUNCTION_INVOCATION_TIMEOUT en producción, 2026-08-13). Separarlas
// en dos invocaciones de funcion (dos crons, dos fetch en el boton) es la
// unica forma de acotar cada una a su propio limite de tiempo.
/**
 * Errores que ya dejaron su fila en finanzas_ih_ejecuciones.
 *
 * WeakSet y no una bandera en el objeto: no le agrega propiedades a un Error
 * ajeno y no impide que se recolecte.
 */
const yaRegistradas = new WeakSet<object>();

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
    const t0 = Date.now();
    const yaRespaldados = await listarClavesYaRespaldadasIh();
    console.log(`[sincronizar-ih] listarClavesYaRespaldadasIh: ${Date.now() - t0}ms`);

    // Secuencial, no en paralelo: son sesiones de login independientes
    // contra el SII con la misma cuenta, y el SII puede invalidar una sesion
    // activa si detecta otra concurrente del mismo representante.
    const t1 = Date.now();
    // ventanaDias 15, no 7: un documento "pendiente" pasa a "registro" solo
    // (aceptacion tacita) recien a los 8 dias -- con una ventana de 7 dias
    // el documento envejece fuera del alcance justo antes de que el SII
    // actualice su estado, y ese cambio nunca se vuelve a mirar. 15 dias da
    // margen para que el cron lo alcance a recapturar en los dias
    // siguientes (no cuesta requests extra al SII: la consulta ya trae el
    // mes completo, esto solo cambia el filtro que se aplica DESPUES).
    const documentosRcv = await extraerDocumentosIhRcv(creds, empresas, { cargaInicial: opciones.cargaInicial, ventanaDias: 15 });
    console.log(`[sincronizar-ih] extraerDocumentosIhRcv: ${Date.now() - t1}ms, ${documentosRcv.length} docs`);
    const t2 = Date.now();
    // Las guias van en su PROPIO try y su fallo no descarta lo del RCV.
    //
    // El 21-09-2026 el RCV trajo 33 documentos en 36s y despues el portal MIPYME
    // no mostro el selector de empresa: la excepcion subio hasta el catch de
    // abajo y los 33 se perdieron, porque el unico guardarDocumentosIh esta
    // DESPUES de este paso. En la base ese dia quedaron cero escrituras.
    //
    // Es la misma leccion que el scraper del SII principal ya habia aprendido
    // guardando mes por mes (ver alTerminarPeriodo en
    // app/(protegido)/finanzas/sii/acciones.ts): lo que ya costo traer no se
    // tira porque falle el paso siguiente.
    let documentosGuias: DocumentoIh[] = [];
    let codigosEmitidos = new Map<string, string>();
    let codigosRecibidos = new Map<string, string>();
    let respaldos = new Map<string, RespaldoDocumento>();
    let falloGuias: unknown = null;
    try {
      ({ documentos: documentosGuias, codigosEmitidos, codigosRecibidos, respaldos } = await extraerGuiasYCodigosIh(
        creds,
        empresas,
        // limiteRespaldo bajo a proposito: cada intento hace 2-3 requests
        // reales al SII (lentos) mas una subida a Graph, y maxDuration=60s en
        // Vercel Hobby -- mejor ponerse al dia de a poco en varias corridas
        // que arriesgar timeout en una sola.
        { cargaInicial: opciones.cargaInicial, ventanaDias: 7, yaRespaldados, limiteRespaldo: 5 }
      ));
      console.log(`[sincronizar-ih] extraerGuiasYCodigosIh: ${Date.now() - t2}ms, ${documentosGuias.length} docs`);
    } catch (err) {
      falloGuias = err;
      console.error("[sincronizar-ih] extraerGuiasYCodigosIh fallo; se guarda igual lo que trajo el RCV:", err);
    }

    // El RCV no trae el codigo del portal MIPYME: se completa matcheando
    // por (folio, rut contraparte) con lo que devolvio extraerGuiasYCodigosIh
    // en la MISMA corrida.
    for (const doc of documentosRcv) {
      const clave = claveDocumento(doc.folio, doc.rutContraparte);
      doc.codigoPortal = (doc.direccion === "venta" ? codigosEmitidos.get(clave) : codigosRecibidos.get(clave)) ?? null;
    }

    const documentos = [...documentosRcv, ...documentosGuias];
    const nuevos = await guardarDocumentosIh(documentos);
    const archivosSubidos = await actualizarRespaldosPorClaveIh(respaldos);

    if (falloGuias) {
      // La corrida se registra como FALLIDA, pero con lo que si entro: decir
      // "0 nuevos" cuando entraron 33 seria mentir en el registro que despues
      // se usa para saber si el panel esta al dia.
      const mensaje = falloGuias instanceof Error ? falloGuias.message : "Error desconocido";
      await registrarEjecucionIh(false, nuevos, archivosSubidos, mensaje).catch(() => {});
      yaRegistradas.add(falloGuias as object);
      // Y se relanza: el run tiene que quedar en rojo. Que el dato se haya
      // salvado no vuelve normal que el portal MIPYME no conteste, y si esto
      // se volviera silencioso nadie se enteraria el dia que deje de andar del
      // todo. Los documentos sin codigo_portal se completan solos en la corrida
      // siguiente: la ventana de lectura es de 15 dias y el guardado es upsert.
      throw falloGuias;
    }

    await registrarEjecucionIh(true, nuevos, archivosSubidos);
    return { documentos: documentos.length, nuevos, archivosSubidos };
  } catch (err) {
    // El fallo de guias YA se registro arriba, con los contadores reales de lo
    // que si entro. Sin esta guarda, al relanzarlo caia aca y escribia una
    // segunda fila con 0 y 0 encima: el registro diria que no entro nada
    // justamente el dia en que lo importante fue que si entro algo.
    if (typeof err === "object" && err !== null && yaRegistradas.has(err)) throw err;
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    await registrarEjecucionIh(false, 0, 0, mensaje).catch(() => {});
    throw err;
  }
}

// Boletas de Honorarios recibidas por IH: login totalmente distinto (RUT y
// clave PROPIOS de IH, no el representante), en su propia invocacion de
// funcion -- ver comentario de arriba.
export async function sincronizarBoletasHonorariosIh(opciones: { cargaInicial: boolean }): Promise<{
  documentos: number;
  nuevos: number;
  archivosSubidos: number;
}> {
  try {
    const yaRespaldados = await listarClavesYaRespaldadasIh();
    const { documentos, respaldos } = await extraerBoletasHonorariosIh({
      cargaInicial: opciones.cargaInicial,
      yaRespaldados,
      limiteRespaldo: 5,
    });

    const nuevos = await guardarDocumentosIh(documentos);
    const archivosSubidos = await actualizarRespaldosPorClaveIh(respaldos);

    await registrarEjecucionIh(true, nuevos, archivosSubidos);
    return { documentos: documentos.length, nuevos, archivosSubidos };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error desconocido";
    await registrarEjecucionIh(false, 0, 0, mensaje).catch(() => {});
    throw err;
  }
}
