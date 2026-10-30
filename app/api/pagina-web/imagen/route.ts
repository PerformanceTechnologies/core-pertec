import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { subirImagen } from "@/lib/pagina-web";
import { BUCKETS_WEB, SLUG_APP_PAGINA_WEB } from "@/lib/pagina-web-modelo";
import { LIMITE_SUBIDA } from "@/lib/subidas";

export const runtime = "nodejs";

// Sube una imagen del catálogo o de un caso al storage del sitio, ya comprimida.
//
// Es una ruta y no una Server Action por el tamaño: una Server Action acepta 1 MB por
// omisión y una foto de celular pesa 3–4. El tope real es el de Vercel (~4,5 MB), que
// el formulario avisa antes de mandar (ver lib/subidas.ts).
export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP_PAGINA_WEB);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const form = await request.formData().catch(() => null);
  const bucket = BUCKETS_WEB.find((b) => b === form?.get("bucket"));
  const archivo = form?.get("archivo");
  if (!bucket || !(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta la imagen o el destino." }, { status: 400 });
  }
  if (!archivo.type.startsWith("image/")) {
    return NextResponse.json({ error: `"${archivo.name}" no es una imagen.` }, { status: 400 });
  }
  if (archivo.size > LIMITE_SUBIDA) {
    return NextResponse.json({ error: `"${archivo.name}" pasa el tope de 4 MB.` }, { status: 413 });
  }

  try {
    const url = await subirImagen(bucket, Buffer.from(await archivo.arrayBuffer()));
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[pagina-web] Error al subir imagen:", e);
    const mensaje = e instanceof Error && /unsupported image format|Input buffer/i.test(e.message)
      ? `No se pudo leer "${archivo.name}" como imagen. Prueba con JPG o PNG.`
      : "No se pudo subir la imagen.";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
