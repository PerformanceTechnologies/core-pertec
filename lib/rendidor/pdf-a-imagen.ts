import "server-only";
import path from "node:path";

// Las páginas de un PDF como PNG, para embeberlas en la hoja Respaldos.
//
// Excel no puede mostrar un PDF dentro de una celda, y la mitad de los respaldos
// son PDF (boletas electrónicas, recibos de Uber): sin esto la planilla salía con
// un aviso en vez del comprobante. pdf.js dibuja la página sobre @napi-rs/canvas,
// que es el canvas que pdf.js usa en Node cuando está instalado.
//
// Los dos paquetes van en serverExternalPackages: pdf.js carga su worker con un
// import dinámico y @napi-rs/canvas es un binario nativo, y ninguna de las dos
// cosas sobrevive a que el bundler los empaquete.

// Lado mayor del render. miniaturaParaExcel lo baja igual a <=1400 px; renderizar
// más grande solo gasta memoria (son 14 PDFs en paralelo en una rendición real).
const LADO_MAXIMO = 1600;

// Sin las fuentes estándar, un PDF que usa Helvetica sin embeberla sale con una
// fuente de reemplazo y un warning por cada una. En Node pdf.js las lee con fs, así
// que va una ruta de archivo (no una URL file://), con la barra final.
const FUENTES_ESTANDAR = path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts") + path.sep;

// Una boleta o un recibo de Uber tiene 1 o 2 páginas. El tope es para que un PDF
// largo (un contrato adjunto por error) no infle la planilla ni el tiempo de la
// función; cada página ocupa una fila de la ficha y la ficha tiene lugar para 5.
export const MAX_PAGINAS_PDF = 5;

export interface PdfRenderizado {
  /** Una PNG por página, hasta MAX_PAGINAS_PDF. */
  pngs: Buffer[];
  /** Páginas del documento, aunque no se hayan dibujado todas. */
  paginas: number;
}

/** Devuelve null si el PDF no se puede leer, y quien llama pone el aviso. */
export async function paginasComoImagen(pdf: Buffer): Promise<PdfRenderizado | null> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const documento = await pdfjs.getDocument({
      data: new Uint8Array(pdf),
      standardFontDataUrl: FUENTES_ESTANDAR,
      isEvalSupported: false,
    }).promise;

    try {
      // La fábrica de canvas de pdf.js en Node es la de @napi-rs/canvas.
      const fabrica = documento.canvasFactory as {
        create(ancho: number, alto: number): { canvas: { toBuffer(tipo: "image/png"): Buffer }; context: unknown };
      };

      // Una página a la vez: cada canvas de 1600 px son ~8 MB y los PDFs de la
      // rendición ya se procesan en paralelo entre sí.
      const pngs: Buffer[] = [];
      for (let n = 1; n <= Math.min(documento.numPages, MAX_PAGINAS_PDF); n++) {
        const pagina = await documento.getPage(n);
        const base = pagina.getViewport({ scale: 1 });
        const viewport = pagina.getViewport({ scale: LADO_MAXIMO / Math.max(base.width, base.height) });
        const { canvas, context } = fabrica.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await pagina.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: context as CanvasRenderingContext2D,
          viewport,
        }).promise;
        pngs.push(canvas.toBuffer("image/png"));
        pagina.cleanup();
      }

      return { pngs, paginas: documento.numPages };
    } finally {
      await documento.destroy();
    }
  } catch (e) {
    console.error("[rendidor] No se pudo convertir el PDF a imagen para el Excel:", e);
    return null;
  }
}
