import "server-only";
import path from "node:path";

// Primera página de un PDF como PNG, para embeberla en la hoja Respaldos.
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

export interface PaginaRenderizada {
  png: Buffer;
  paginas: number;
}

/** Devuelve null si el PDF no se puede leer, y quien llama pone el aviso. */
export async function primeraPaginaComoImagen(pdf: Buffer): Promise<PaginaRenderizada | null> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const documento = await pdfjs.getDocument({
      data: new Uint8Array(pdf),
      standardFontDataUrl: FUENTES_ESTANDAR,
      isEvalSupported: false,
    }).promise;

    try {
      const pagina = await documento.getPage(1);
      const base = pagina.getViewport({ scale: 1 });
      const escala = LADO_MAXIMO / Math.max(base.width, base.height);
      const viewport = pagina.getViewport({ scale: escala });

      // La fábrica de canvas de pdf.js en Node es la de @napi-rs/canvas.
      const fabrica = documento.canvasFactory as {
        create(ancho: number, alto: number): { canvas: { toBuffer(tipo: "image/png"): Buffer }; context: unknown };
      };
      const { canvas, context } = fabrica.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await pagina.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as CanvasRenderingContext2D,
        viewport,
      }).promise;

      return { png: canvas.toBuffer("image/png"), paginas: documento.numPages };
    } finally {
      await documento.destroy();
    }
  } catch (e) {
    console.error("[rendidor] No se pudo convertir el PDF a imagen para el Excel:", e);
    return null;
  }
}
