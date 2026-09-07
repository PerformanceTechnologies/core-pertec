import "server-only";
import sharp from "sharp";

// La miniatura que se embebe en el Excel: lo único del rendidor que necesita sharp.
//
// Separado de ./almacenamiento.ts por peso del bundle, igual que lib/ofertas/imagenes-subir.ts:
// sharp arrastra su binario de libvips (16 MB) a toda función que importe el archivo, y
// ./almacenamiento.ts lo importan las páginas de Rendir Gastos y las rutas de subir y
// adjuntar respaldos, que solo suben, bajan y firman URLs. La única que reduce una imagen
// es /api/rendidor/[id]/excel.

// Objetivo de peso por imagen embebida en el Excel, igual que la skill: 35 KB en
// escala de grises. Con eso una planilla de 16 respaldos pesa ~600 KB en vez de
// varios MB, y el documento sigue perfectamente legible.
const OBJETIVO_KB = 35;
const ESCALONES: [number, number][] = [
  [1400, 65],
  [1200, 60],
  [1000, 55],
  [900, 50],
];

/**
 * Version chica y en escala de grises para embeber en el Excel.
 *
 * Antes esto se hacia en el navegador con un canvas y viajaba en el request.
 * Ahora se hace con sharp del lado del servidor, que lee del bucket: el
 * navegador dejo de tener que retener los archivos.
 *
 * Devuelve null para un PDF (no se puede embeber en una celda) o si la
 * conversion falla, y quien llama pone el aviso en la planilla.
 */
export async function miniaturaParaExcel(contenido: Buffer, mimeType: string): Promise<Buffer | null> {
  if (mimeType === "application/pdf") return null;

  try {
    for (const [maxDim, calidad] of ESCALONES) {
      const salida = await sharp(contenido)
        // flatten sobre blanco: un PNG con transparencia perderia el fondo al
        // pasar a JPEG y saldria texto oscuro sobre negro.
        .flatten({ background: "#ffffff" })
        .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
        .grayscale()
        // grayscale() convierte los colores a gris, pero el JPEG sale igual con
        // 3 canales sRGB: gris a la vista y con el peso de una imagen en color.
        // toColourspace lo baja a 1 canal real, que es el modo "L" que usa la
        // skill.
        .toColourspace("b-w")
        .jpeg({ quality: calidad, mozjpeg: true })
        .toBuffer();

      // Se corta en el primer escalon que baja del objetivo para no degradar mas
      // de lo necesario; el ultimo se acepta como sea.
      if (salida.length <= OBJETIVO_KB * 1024 || maxDim === 900) return salida;
    }
    return null;
  } catch (e) {
    console.error("[rendidor] No se pudo generar la miniatura para el Excel:", e);
    return null;
  }
}
