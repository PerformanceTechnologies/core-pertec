/**
 * Reduce una imagen a un logo liviano: como máximo `lado` píxeles por lado.
 *
 * Se hace en el navegador para que una foto de 4 MB tomada con el teléfono no viaje entera: lo
 * que llega al servidor son unos pocos KB. Sale en PNG, que conserva la transparencia de un logo;
 * si aun así queda pesada (una foto), en JPG sobre fondo blanco.
 */
export async function reducirImagen(archivo: File, lado = 240): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(archivo.type)) {
    throw new Error("Elige una imagen PNG, JPG, WebP o SVG.");
  }

  const url = URL.createObjectURL(archivo);
  try {
    const imagen = await new Promise<HTMLImageElement>((resolver, rechazar) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = () => rechazar(new Error("No se pudo leer la imagen."));
      img.src = url;
    });

    const escala = Math.min(1, lado / Math.max(imagen.naturalWidth || lado, imagen.naturalHeight || lado));
    const ancho = Math.max(1, Math.round((imagen.naturalWidth || lado) * escala));
    const alto = Math.max(1, Math.round((imagen.naturalHeight || lado) * escala));

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("Este navegador no puede preparar la imagen.");
    ctx.drawImage(imagen, 0, 0, ancho, alto);

    const png = lienzo.toDataURL("image/png");
    if (png.length <= 250_000) return png;

    // Una foto en PNG pesa demasiado: JPG, con fondo blanco donde había transparencia.
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    return lienzo.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
