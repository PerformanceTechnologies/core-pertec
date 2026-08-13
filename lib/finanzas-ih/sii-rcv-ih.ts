import "server-only";
import { lanzarNavegador } from "../playwright-navegador";
import { login, consultarPeriodo, type CredencialesSii, type FacturaSii } from "../sii-rcv";

// Facturas IH reutiliza el mismo scraper del RCV (lib/sii-rcv.ts) pero para
// dos empresas nuevas (IH, IL) -- ninguna es la PERTEC SpA que ya cubre el
// sub-panel finanzas/sii -- y con mas tipos de documento: ademas de factura
// afecta/exenta (33/34) tambien notas de credito/debito (56/61). El
// representante y la clave tributaria son los mismos para ambas empresas
// (confirmado con el usuario), asi que un solo login basta para consultar el
// RCV de las dos sin volver a autenticarse.

export type EmpresaIh = "IH" | "IL";
// guia_despacho y boleta no salen del RCV (ver TIPO_DOCUMENTO_POR_CODIGO mas
// abajo, que solo mapea 33/34/56/61): los agrega lib/finanzas-ih/sii-guias-ih.ts,
// que los trae desde el Portal MIPYME en vez del RCV. boleta_honorarios
// tampoco: viene de un sistema totalmente distinto del SII (ver
// lib/finanzas-ih/sii-bhe-ih.ts) -- no es un DTE, por eso no tiene un
// codigoDte real (ver CODIGO_DTE_BOLETA_HONORARIOS ahi).
export type TipoDocumentoIh =
  | "factura_afecta"
  | "factura_exenta"
  | "nota_credito"
  | "nota_debito"
  | "guia_despacho"
  | "boleta"
  | "boleta_honorarios";

const CODIGOS_DTE_IH = [33, 34, 56, 61];

const TIPO_DOCUMENTO_POR_CODIGO: Record<number, TipoDocumentoIh> = {
  33: "factura_afecta",
  34: "factura_exenta",
  56: "nota_debito",
  61: "nota_credito",
};

export interface EmpresaIhConfig {
  empresa: EmpresaIh;
  rutEmpresa: string;
}

export interface DocumentoIh {
  empresa: EmpresaIh;
  tipoDocumento: TipoDocumentoIh;
  direccion: "compra" | "venta";
  codigoDte: number;
  // null para fuentes que no tienen un sub-estado equivalente al del RCV
  // (ej. guias de despacho via Portal MIPYME, ver sii-guias-ih.ts).
  estadoSii: "registro" | "pendiente" | "no_incluir" | "reclamado" | null;
  rutContraparte: string;
  razonSocialContraparte: string | null;
  folio: number;
  fechaEmision: string | null;
  montoExento: number | null;
  montoNeto: number | null;
  montoIva: number | null;
  montoTotal: number | null;
  periodo: string;
  fuente: "rcv" | "portal_mipyme";
  // CODIGO interno del portal MIPYME (mipeGesDocEmi.cgi / mipeGesDocRcp.cgi),
  // necesario para descargar el XML/PDF del documento -- ver
  // lib/finanzas-ih/sii-descarga-documentos-ih.ts. El RCV no lo trae: se
  // completa en lib/finanzas-ih/sincronizar.ts matcheando por folio+rut con
  // lo que devuelve lib/finanzas-ih/sii-guias-ih.ts.
  codigoPortal: string | null;
}

function aDocumentoIh(f: FacturaSii, empresa: EmpresaIh): DocumentoIh {
  return {
    empresa,
    tipoDocumento: TIPO_DOCUMENTO_POR_CODIGO[f.codigoDte],
    direccion: f.tipoDocumento,
    codigoDte: f.codigoDte,
    estadoSii: f.estado,
    rutContraparte: f.rutContraparte,
    razonSocialContraparte: f.razonSocial,
    folio: f.folio,
    fechaEmision: f.fechaDocto,
    montoExento: f.montoExento,
    montoNeto: f.montoNeto,
    montoIva: f.montoIvaRecuperable ?? f.montoIvaNoRecuperable,
    montoTotal: f.montoTotal,
    periodo: f.periodo,
    fuente: "rcv",
    codigoPortal: null,
  };
}

export interface OpcionesExtraccionIh {
  // Igual semantica que OpcionesExtraccion en sii-rcv.ts: true trae todo el
  // periodo actual (carga inicial), false filtra a los ultimos ventanaDias
  // dias por fecha de emision.
  cargaInicial: boolean;
  ventanaDias?: number;
}

export async function extraerDocumentosIhRcv(
  creds: Pick<CredencialesSii, "rutRepresentante" | "claveTributaria">,
  empresas: EmpresaIhConfig[],
  opciones: OpcionesExtraccionIh
): Promise<DocumentoIh[]> {
  const ventanaDias = opciones.ventanaDias ?? 7;
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - ventanaDias);

  const periodos = new Set<string>();
  periodos.add(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`);
  if (!opciones.cargaInicial) {
    periodos.add(`${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, "0")}`);
  }

  const browser = await lanzarNavegador();
  try {
    const page = await browser.newPage();
    // rutEmpresa no se usa en login(): se elige recien en consultarPeriodo,
    // por eso basta un solo login para las dos empresas.
    await login(page, { ...creds, rutEmpresa: "" });

    let documentos: DocumentoIh[] = [];
    for (const { empresa, rutEmpresa } of empresas) {
      for (const periodo of periodos) {
        const [anio, mes] = periodo.split("-");
        const filas = await consultarPeriodo(page, rutEmpresa, mes, anio, CODIGOS_DTE_IH);
        documentos = documentos.concat(filas.map((f) => aDocumentoIh(f, empresa)));
      }
    }

    if (!opciones.cargaInicial) {
      const desdeIso = desde.toISOString().slice(0, 10);
      documentos = documentos.filter((d) => !d.fechaEmision || d.fechaEmision >= desdeIso);
    }

    return documentos;
  } finally {
    await browser.close();
  }
}
