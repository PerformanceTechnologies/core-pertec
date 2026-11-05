import "server-only";
import sharp from "sharp";

// Normaliza una foto de producto antes de guardarla. Va aparte de lib/inventario.ts por peso:
// sharp arrastra su binario a toda función que lo importe, y solo lo necesita quien sube.
//
//  · Se gira según el EXIF (las fotos del celular vienen «acostadas») y después se descarta
//    TODO el metadato: una foto tomada en bodega trae GPS, modelo del teléfono y fecha.
//  · Dos versiones en JPEG: una para mirarla (hasta 1600 px) y una miniatura cuadrada de
//    240 px para listas y fichas, que es lo que se pide en cada página.

export async function normalizarFotoProducto(contenido: Buffer): Promise<{ grande: Buffer; miniatura: Buffer }> {
  const base = sharp(contenido, { failOn: "error" }).rotate();
  const [grande, miniatura] = await Promise.all([
    base.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer(),
    base.clone().resize({ width: 240, height: 240, fit: "cover", position: "attention" }).jpeg({ quality: 76, mozjpeg: true }).toBuffer(),
  ]);
  return { grande, miniatura };
}
