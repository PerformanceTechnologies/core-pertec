import "server-only";
import sharp from "sharp";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream } from "pdf-lib";
import type { ImagenExtraida } from "./extraer-texto";

/**
 * Las imágenes incrustadas en un PDF, en el orden en que se dibujan.
 *
 * Un borrador exportado a PDF lleva las mismas fotos y diagramas que el Word,
 * pero guardadas de otra forma: como objetos de imagen dentro del archivo. Sacarlas
 * es lo que permite que subir el PDF y subir el .docx den el mismo documento, en
 * vez de tener que explicarle a alguien que use el formato correcto.
 *
 * El ORDEN no sale del diccionario de recursos, que no tiene orden: sale del flujo
 * de contenido de cada página, donde cada imagen se dibuja con un operador
 * "/Im3 Do". Recorriendo las páginas en orden y los operadores en orden se obtiene
 * la secuencia real del documento — que es lo que hace que el marcador [IMAGEN n]
 * signifique algo cuando el modelo lo ve en el texto.
 *
 * Y se descartan los repetidos por referencia de objeto: el membrete de una oferta
 * está dibujado en las seis páginas, pero es UNA imagen.
 */

/**
 * Deshace el filtrado PNG de un flujo comprimido con predictor.
 *
 * Un PDF puede pedir que las filas se guarden como diferencias respecto de la
 * anterior o del píxel de al lado —el mismo truco que usa PNG— y eso agrega UN
 * BYTE por fila que dice qué diferencia se usó. pdf-lib descomprime el flate pero
 * no deshace ese filtrado, así que sin esto cada fila queda corrida un byte
 * respecto de la anterior: la imagen sale rayada en diagonal, con las letras
 * partidas. Se vio extrayendo el logo de una oferta real.
 *
 * Los cinco filtros son los de la especificación PNG y el algoritmo es el de ahí.
 */
export function deshacerPredictorPng(
  datos: Buffer,
  columnas: number,
  canales: number,
  bits: number,
): Buffer | null {
  const bytesPorPixel = Math.max(1, Math.ceil((canales * bits) / 8));
  const bytesPorFila = Math.ceil((columnas * canales * bits) / 8);
  const filas = Math.floor(datos.length / (bytesPorFila + 1));
  if (filas === 0) return null;

  const salida = Buffer.alloc(filas * bytesPorFila);
  let anterior = Buffer.alloc(bytesPorFila);

  for (let fila = 0; fila < filas; fila++) {
    const desde = fila * (bytesPorFila + 1);
    const tipo = datos[desde];
    const actual = Buffer.from(datos.subarray(desde + 1, desde + 1 + bytesPorFila));

    for (let i = 0; i < bytesPorFila; i++) {
      const izquierda = i >= bytesPorPixel ? actual[i - bytesPorPixel] : 0;
      const arriba = anterior[i];
      const diagonal = i >= bytesPorPixel ? anterior[i - bytesPorPixel] : 0;

      switch (tipo) {
        case 0:
          break;
        case 1:
          actual[i] = (actual[i] + izquierda) & 0xff;
          break;
        case 2:
          actual[i] = (actual[i] + arriba) & 0xff;
          break;
        case 3:
          actual[i] = (actual[i] + ((izquierda + arriba) >> 1)) & 0xff;
          break;
        case 4: {
          // Paeth: se elige el vecino cuyo valor predicho queda más cerca.
          const p = izquierda + arriba - diagonal;
          const dIzquierda = Math.abs(p - izquierda);
          const dArriba = Math.abs(p - arriba);
          const dDiagonal = Math.abs(p - diagonal);
          const mejor =
            dIzquierda <= dArriba && dIzquierda <= dDiagonal
              ? izquierda
              : dArriba <= dDiagonal
                ? arriba
                : diagonal;
          actual[i] = (actual[i] + mejor) & 0xff;
          break;
        }
        default:
          return null;
      }
    }

    actual.copy(salida, fila * bytesPorFila);
    anterior = actual;
  }

  return salida;
}

/**
 * Las muestras de un flujo de imagen, ya sin compresión y sin predictor.
 */
function muestrasDeFlujo(
  doc: PDFDocument,
  flujo: PDFRawStream,
  columnas: number,
  canales: number,
  bits: number,
): Buffer | null {
  const crudo = Buffer.from(decodePDFRawStream(flujo).decode());

  const parms = flujo.dict.get(PDFName.of("DecodeParms"));
  const dict = parms instanceof PDFRef ? doc.context.lookup(parms) : parms;
  const predictor = dict instanceof PDFDict ? Number(dict.get(PDFName.of("Predictor")) ?? 1) : 1;

  if (predictor >= 10) {
    const columnasParm =
      dict instanceof PDFDict ? Number(dict.get(PDFName.of("Columns")) ?? columnas) : columnas;
    const canalesParm = dict instanceof PDFDict ? Number(dict.get(PDFName.of("Colors")) ?? canales) : canales;
    return deshacerPredictorPng(crudo, columnasParm || columnas, canalesParm || canales, bits);
  }
  // El predictor 2 (TIFF) no aparece en la práctica en estos documentos; si
  // apareciera, es mejor omitir la imagen que dibujarla corrida.
  if (predictor !== 1) {
    console.warn(`[ofertas] imagen de PDF omitida: predictor ${predictor} no soportado.`);
    return null;
  }
  return crudo;
}

/** Cuántos canales tiene un espacio de color, o null si no se sabe manejar. */
function canalesDeEspacio(doc: PDFDocument, valor: unknown): 1 | 3 | null {
  const resuelto = valor instanceof PDFRef ? doc.context.lookup(valor) : valor;

  if (resuelto instanceof PDFName) {
    const nombre = resuelto.toString();
    if (nombre === "/DeviceRGB") return 3;
    if (nombre === "/DeviceGray") return 1;
    return null;
  }

  if (resuelto instanceof PDFArray) {
    const familia = resuelto.get(0)?.toString();
    // ICCBased: el número de componentes está en /N del propio flujo.
    if (familia === "/ICCBased") {
      const perfil = doc.context.lookup(resuelto.get(1));
      const n = perfil instanceof PDFRawStream ? Number(perfil.dict.get(PDFName.of("N"))) : 0;
      if (n === 3) return 3;
      if (n === 1) return 1;
      return null;
    }
    // Indexado, separación, CMYK y compañía: no se reconstruyen acá. Se omiten,
    // que es mejor que dibujar una imagen con los colores cambiados.
    return null;
  }

  return null;
}

/** Los bytes de un flujo de imagen, ya como archivo PNG o JPEG. */
async function imagenDeFlujo(
  doc: PDFDocument,
  flujo: PDFRawStream,
): Promise<{ contenido: Buffer; extension: string } | null> {
  const dict = flujo.dict;
  const filtros = String(dict.get(PDFName.of("Filter")) ?? "");
  const ancho = Number(dict.get(PDFName.of("Width")));
  const alto = Number(dict.get(PDFName.of("Height")));
  if (!ancho || !alto) return null;

  // Un JPEG incrustado ES un JPEG: los bytes del flujo se usan tal cual.
  if (filtros.includes("DCTDecode")) {
    return { contenido: Buffer.from(flujo.contents), extension: "jpg" };
  }

  // JPEG2000 y los faxes CCITT necesitarían decodificadores propios.
  if (!filtros.includes("FlateDecode")) {
    console.warn(`[ofertas] imagen de PDF omitida: filtro ${filtros} no soportado.`);
    return null;
  }

  const bits = Number(dict.get(PDFName.of("BitsPerComponent")) ?? 8);
  const canales = canalesDeEspacio(doc, dict.get(PDFName.of("ColorSpace")));
  if (bits !== 8 || !canales) {
    console.warn(`[ofertas] imagen de PDF omitida: ${bits} bits, espacio de color no reconocido.`);
    return null;
  }

  const muestras = muestrasDeFlujo(doc, flujo, ancho, canales, bits);
  if (!muestras) return null;
  const esperado = ancho * alto * canales;
  if (muestras.length < esperado) {
    // Una máscara de recorte o un predictor que no se descomprimió como se espera:
    // reconstruir a ciegas daría una imagen corrida.
    console.warn(`[ofertas] imagen de PDF omitida: ${muestras.length} bytes, se esperaban ${esperado}.`);
    return null;
  }

  let imagen = sharp(muestras.subarray(0, esperado), {
    raw: { width: ancho, height: alto, channels: canales },
  });

  // La transparencia de un PDF va en un flujo aparte (/SMask), en escala de
  // grises. Sin unirla, un logo con fondo transparente sale con un rectángulo
  // detrás. El detalle que cuesta encontrar está en mascaraDeTransparencia.
  const smask = doc.context.lookup(dict.get(PDFName.of("SMask")));
  if (smask instanceof PDFRawStream) {
    const alfa = await mascaraDeTransparencia(doc, smask, ancho, alto);
    if (alfa) {
      imagen = sharp(await imagen.png().toBuffer()).joinChannel(alfa, {
        raw: { width: ancho, height: alto, channels: 1 },
      });
      return { contenido: await imagen.png({ compressionLevel: 9 }).toBuffer(), extension: "png" };
    }
  }

  return { contenido: await imagen.jpeg({ quality: 82, mozjpeg: true }).toBuffer(), extension: "jpg" };
}

/** La máscara de transparencia, escalada al tamaño de la imagen que acompaña. */
async function mascaraDeTransparencia(
  doc: PDFDocument,
  smask: PDFRawStream,
  ancho: number,
  alto: number,
): Promise<Buffer | null> {
  try {
    const filtros = String(smask.dict.get(PDFName.of("Filter")) ?? "");
    if (!filtros.includes("FlateDecode")) return null;
    const anchoMascara = Number(smask.dict.get(PDFName.of("Width")));
    const altoMascara = Number(smask.dict.get(PDFName.of("Height")));
    const muestras = muestrasDeFlujo(doc, smask, anchoMascara, 1, 8);
    if (!muestras || muestras.length < anchoMascara * altoMascara) return null;
    const gris = muestras.subarray(0, anchoMascara * altoMascara);

    // Del mismo tamaño —el caso normal— se usa tal cual: es un byte por píxel y no
    // hay nada que hacerle.
    if (anchoMascara === ancho && altoMascara === alto) return gris;

    // Escalada, hay que FORZAR un canal a la salida. Sin toColourspace, sharp
    // devuelve el gris convertido a RGB —tres bytes por píxel— y el índice del
    // alfa termina leyendo uno de cada tres: la imagen sale desteñida y a trozos.
    // Costó un rato encontrarlo, así que queda dicho.
    return await sharp(gris, { raw: { width: anchoMascara, height: altoMascara, channels: 1 } })
      .resize(ancho, alto, { fit: "fill" })
      .toColourspace("b-w")
      .raw()
      .toBuffer();
  } catch (error) {
    console.warn("[ofertas] no se pudo leer la transparencia de una imagen del PDF:", error);
    return null;
  }
}

/** Los nombres de XObject dibujados en una página, en orden de aparición. */
function nombresDibujados(doc: PDFDocument, contenidos: unknown): string[] {
  const flujos: unknown[] =
    contenidos instanceof PDFArray ? contenidos.asArray() : contenidos ? [contenidos] : [];

  let texto = "";
  for (const referencia of flujos) {
    const flujo = referencia instanceof PDFRef ? doc.context.lookup(referencia) : referencia;
    if (!(flujo instanceof PDFRawStream)) continue;
    try {
      texto += new TextDecoder("latin1").decode(decodePDFRawStream(flujo).decode());
    } catch {
      // Un flujo con un filtro raro no aporta orden, pero tampoco frena el resto.
    }
  }

  return [...texto.matchAll(/\/([A-Za-z0-9_.#-]+)\s+Do\b/g)].map((coincidencia) => coincidencia[1]);
}

/**
 * Tope de imágenes por documento.
 *
 * Un borrador tiene un membrete, un diagrama y un puñado de fotos. Un archivo con
 * doscientas imágenes es otra cosa —un catálogo, un PDF generado por una
 * herramienta— y reconstruirlas todas costaría minutos para nada.
 */
const MAXIMO_IMAGENES = 30;

export async function extraerImagenesDePdf(archivo: Buffer): Promise<ImagenExtraida[]> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(archivo, { ignoreEncryption: true });
  } catch (error) {
    console.warn("[ofertas] no se pudo abrir el PDF para extraer imágenes:", error);
    return [];
  }

  const imagenes: ImagenExtraida[] = [];
  const yaVistas = new Set<string>();

  for (const [numeroPagina, pagina] of doc.getPages().entries()) {
    const recursos = pagina.node.Resources();
    const xobjects = recursos?.lookup(PDFName.of("XObject"));
    if (!(xobjects instanceof PDFDict)) continue;

    for (const nombre of nombresDibujados(doc, pagina.node.get(PDFName.of("Contents")))) {
      if (imagenes.length >= MAXIMO_IMAGENES) return imagenes;
      const referencia = xobjects.get(PDFName.of(nombre));
      if (!referencia) continue;

      // Por referencia de objeto: el membrete está dibujado en todas las páginas
      // y es una sola imagen.
      const clave = referencia.toString();
      if (yaVistas.has(clave)) continue;
      yaVistas.add(clave);

      const objeto = doc.context.lookup(referencia);
      if (!(objeto instanceof PDFRawStream)) continue;
      if (objeto.dict.get(PDFName.of("Subtype"))?.toString() !== "/Image") continue;

      try {
        const resultado = await imagenDeFlujo(doc, objeto);
        if (!resultado) continue;
        imagenes.push({
          indice: imagenes.length + 1,
          nombre: `pdf-${nombre}.${resultado.extension}`,
          contenido: resultado.contenido,
          pagina: numeroPagina + 1,
        });
      } catch (error) {
        console.warn(`[ofertas] la imagen ${nombre} del PDF no se pudo reconstruir:`, error);
      }
    }
  }

  return imagenes;
}
