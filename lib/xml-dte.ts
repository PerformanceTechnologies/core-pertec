import "server-only";
import { XMLParser } from "fast-xml-parser";

// Parser del XML de Documento Tributario Electronico (DTE) que emite
// PERTEC al facturar (esquema EnvioDTE del SII) -- a diferencia del PDF de
// las facturas de compra (generado por el sistema de cada proveedor, sin
// layout comun), este XML sigue siempre el mismo esquema sin importar el
// tipo de documento, asi que se puede parsear con confianza total.

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (nombre) => ["Documento", "DTE", "Detalle", "Referencia"].includes(nombre),
});

export interface ItemDetalleDte {
  nombre: string;
  descripcion: string | null;
  cantidad: number | null;
  precioUnitario: number | null;
  monto: number | null;
}

export interface DteParseado {
  tipoDte: number | null;
  folio: number | null;
  fechaEmision: string | null; // YYYY-MM-DD
  rutReceptor: string | null;
  razonSocialReceptor: string | null;
  montoExento: number | null;
  montoNeto: number | null;
  montoIva: number | null;
  montoTotal: number | null;
  datos: {
    emisor: { rut: string | null; razonSocial: string | null; giro: string | null };
    receptor: { rut: string | null; razonSocial: string | null; giro: string | null; direccion: string | null };
    detalle: ItemDetalleDte[];
  };
}

function numeroONull(valor: unknown): number | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function textoONull(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  const s = String(valor).trim();
  return s === "" ? null : s;
}

// Un EnvioDTE puede traer mas de un <Documento> (envio en lote). En la
// practica cada archivo de HISTORICO DE SII/XML_SII trae uno solo, pero se
// parsean todos por si acaso -- ignorar los de mas seria peor que sobrar.
export function parsearXmlDte(contenidoXml: string): DteParseado[] {
  const xml = parser.parse(contenidoXml);
  const setDte = xml?.EnvioDTE?.SetDTE;
  if (!setDte) return [];

  const bloquesDte = Array.isArray(setDte.DTE) ? setDte.DTE : setDte.DTE ? [setDte.DTE] : [];

  const resultado: DteParseado[] = [];
  for (const bloque of bloquesDte) {
    const documentos = Array.isArray(bloque.Documento) ? bloque.Documento : bloque.Documento ? [bloque.Documento] : [];
    for (const doc of documentos) {
      const encabezado = doc.Encabezado ?? {};
      const idDoc = encabezado.IdDoc ?? {};
      const emisor = encabezado.Emisor ?? {};
      const receptor = encabezado.Receptor ?? {};
      const totales = encabezado.Totales ?? {};
      const detalleRaw = Array.isArray(doc.Detalle) ? doc.Detalle : doc.Detalle ? [doc.Detalle] : [];

      resultado.push({
        tipoDte: numeroONull(idDoc.TipoDTE),
        folio: numeroONull(idDoc.Folio),
        fechaEmision: textoONull(idDoc.FchEmis),
        rutReceptor: textoONull(receptor.RUTRecep),
        razonSocialReceptor: textoONull(receptor.RznSocRecep),
        montoExento: numeroONull(totales.MntExe),
        montoNeto: numeroONull(totales.MntNeto),
        montoIva: numeroONull(totales.IVA),
        montoTotal: numeroONull(totales.MntTotal),
        datos: {
          emisor: {
            rut: textoONull(emisor.RUTEmisor),
            razonSocial: textoONull(emisor.RznSoc),
            giro: textoONull(emisor.GiroEmis),
          },
          receptor: {
            rut: textoONull(receptor.RUTRecep),
            razonSocial: textoONull(receptor.RznSocRecep),
            giro: textoONull(receptor.GiroRecep),
            direccion: [textoONull(receptor.DirRecep), textoONull(receptor.CmnaRecep), textoONull(receptor.CiudadRecep)]
              .filter(Boolean)
              .join(", "),
          },
          detalle: detalleRaw.map((item: Record<string, unknown>) => ({
            nombre: textoONull(item.NmbItem) ?? "",
            descripcion: textoONull(item.DscItem),
            cantidad: numeroONull(item.QtyItem),
            precioUnitario: numeroONull(item.PrcItem),
            monto: numeroONull(item.MontoItem),
          })),
        },
      });
    }
  }

  return resultado;
}
