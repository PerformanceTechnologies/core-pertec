import "server-only";
import { obtenerEmpresaPorNombre } from "@/lib/cotizador/empresas-datos";
import type { Empresa, EmpresaIdentidad } from "@/lib/cotizador/empresas";
import { ofertaAHtml } from "./plantilla";
import { calcularTotales } from "./verificar";
import { firmaDe, type OfertaCanonica } from "./tipos";
import { estiloParaOferta } from "./maestros";
import type { EstiloMaestro } from "./estilo";
import { logosParaDocumento } from "./logos-archivo";
import type { LogosDocumento } from "./logo";
import { imagenesParaDocumento, type ImagenGuardada } from "./imagenes";

/**
 * El documento armado, sin imprimir.
 *
 * Está separado de ./pdf.ts a propósito, y no por orden: pdf.ts importa el navegador en
 * el tope del archivo, así que TODO lo que importe algo de ahí se lleva playwright-core y
 * el Chromium de Vercel al bundle de su función, aunque nunca los abra. La ruta de la
 * vista —que solo maqueta HTML y se pide en cada refresco del editor— cargaba con esos
 * ~50 MB, con su arranque en frío y con una entrada de `outputFileTracingIncludes` que
 * no le hacía falta.
 *
 * Regla que quedó: lo que abre un navegador vive en pdf.ts; lo que solo maqueta, acá.
 */

/** El documento y las piezas con las que se armó, que el pie y la cabecera de impresión reusan. */
export interface PiezasDelDocumento {
  html: string;
  empresa: EmpresaIdentidad;
  estilo: EstiloMaestro;
  logos: LogosDocumento;
}

/**
 * Arma el documento una sola vez y devuelve también sus piezas.
 *
 * La impresión necesita el estilo y los logos para las cajas de margen de Chromium. Antes
 * las volvía a pedir por su cuenta: dos consultas más por PDF y, peor, la posibilidad de
 * que el header saliera con una piel distinta a la del cuerpo.
 */
export async function piezasDelDocumento(
  oferta: OfertaCanonica,
  nombreEmpresa: Empresa,
  maestroId: string | null = null,
  logoClienteRuta: string | null = null,
  inventario: ImagenGuardada[] = [],
  /** La vista del editor dibuja los subtítulos vacíos; el PDF no. Ver ofertaAHtml. */
  paraEditar = false,
): Promise<PiezasDelDocumento> {
  const empresa = await obtenerEmpresaPorNombre(nombreEmpresa);
  if (!empresa) {
    throw new Error(
      `No se encontró la identidad de "${nombreEmpresa}". Cárgala en /cotizador/empresas antes de emitir.`,
    );
  }
  // El estilo cae en cascada: el maestro de la oferta, si no el predeterminado, si no el
  // de PERTEC. Nunca falla.
  //
  // Los logos vienen de otro lado a propósito: el del maestro es la piel y el logo es la
  // identidad. El de la casa sale de la empresa emisora —se sube una vez— y el del
  // cliente, de esta oferta. Ninguno de los dos sale del maestro.
  const [estilo, logos, imagenes] = await Promise.all([
    estiloParaOferta(maestroId),
    logosParaDocumento(empresa, logoClienteRuta),
    imagenesParaDocumento(inventario, imagenesQueUsa(oferta)),
  ]);
  const html = ofertaAHtml(
    oferta,
    calcularTotales(oferta),
    empresa,
    estilo,
    logos,
    imagenes,
    paraEditar,
  );
  return { html, empresa, estilo, logos };
}

/** El HTML sin imprimir, para la previsualización en pantalla. */
export async function ofertaAHtmlConEmpresa(
  oferta: OfertaCanonica,
  nombreEmpresa: Empresa,
  maestroId: string | null = null,
  logoClienteRuta: string | null = null,
  inventario: ImagenGuardada[] = [],
  paraEditar = false,
): Promise<string> {
  const piezas = await piezasDelDocumento(
    oferta,
    nombreEmpresa,
    maestroId,
    logoClienteRuta,
    inventario,
    paraEditar,
  );
  return piezas.html;
}

/**
 * Qué imágenes del inventario pide este documento.
 *
 * Una oferta puede traer ocho imágenes del borrador y dibujar cinco: bajar las
 * tres que no se usan es peso al PDF por nada.
 */
function imagenesQueUsa(oferta: OfertaCanonica): number[] {
  const cierre = oferta.cierre;
  // Una por firmante, no una sola: si el segundo firma con su propia rúbrica y acá
  // no se pide, el documento sale con el hueco vacío y nadie sabe por qué.
  const firmas = cierre
    ? cierre.firmantes.map((_, i) => firmaDe(cierre, i)).filter((n): n is number => n != null)
    : [];
  const enSecciones = Object.values(oferta.imagenesPorSeccion ?? {}).flat();
  // Las que viven DENTRO de un bloque libre no están en imagenesPorSeccion: un documento
  // libre las dibuja en el lugar de su bloque, y sin esto el PDF salía con el hueco.
  const enBloques = (oferta.bloques ?? []).flatMap((b) => b.imagenes ?? []);
  return [...enSecciones, ...enBloques, ...firmas];
}
